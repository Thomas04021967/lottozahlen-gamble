// Prognose-Modell (Spaß-Modell!): kombiniert Signale aus der Vergangenheit zu einem Score je Zahl
// und wählt daraus 6 Zahlen. Lotto ist zufällig – der Backtest zeigt, dass das Modell
// im Durchschnitt nicht besser trifft als reines Raten.
import { K, N } from './stats.js';

export const DEFAULT_WEIGHTS = { overall: 1, recent: 1, overdue: 0.5, pair: 1, patterns: true };
export const RECENT_WINDOW = 52; // ≈ 180 Tage (2 Ziehungen pro Woche)

const P = K / N;
const PAIR_P = (K * (K - 1)) / (N * (N - 1));
const SUM_SD = Math.sqrt((K * (N - K) * (N + 1)) / 12);
const SUM_MEAN = (K * (N + 1)) / 2;
const GAP_SD = Math.sqrt(1 - P) / P;
const clip = (x, lim) => Math.max(-lim, Math.min(lim, x));

// ---- Features aus einer Ziehungsliste (ältestes zuerst) ----
export function buildFeatures(draws, W = RECENT_WINDOW) {
  const D = draws.length;
  const counts = Array(N + 1).fill(0);
  const last = Array(N + 1).fill(-1);
  const pair = Array.from({ length: N + 1 }, () => Array(N + 1).fill(0));
  draws.forEach((d, i) => {
    d.numbers.forEach((n) => { counts[n]++; last[n] = i; });
    for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) {
      pair[d.numbers[a]][d.numbers[b]]++; pair[d.numbers[b]][d.numbers[a]]++;
    }
  });
  return finishFeatures(draws, counts, last, pair, W);
}

function finishFeatures(draws, counts, last, pair, W) {
  const D = draws.length;
  const rc = Array(N + 1).fill(0);
  const recent = draws.slice(-W);
  recent.forEach((d) => d.numbers.forEach((n) => rc[n]++));
  const sdAll = Math.sqrt(D * P * (1 - P));
  const sdRec = Math.sqrt(recent.length * P * (1 - P));
  const pairSd = Math.sqrt(D * PAIR_P * (1 - PAIR_P));
  const f = { overall: [], recent: [], overdue: [], pairZ: Array.from({ length: N + 1 }, () => Array(N + 1).fill(0)) };
  for (let n = 1; n <= N; n++) {
    f.overall[n] = (counts[n] - D * P) / sdAll;
    f.recent[n] = (rc[n] - recent.length * P) / sdRec;
    f.overdue[n] = clip((D - 1 - last[n] - (1 / P - 1)) / GAP_SD, 3);
    for (let m = 1; m <= N; m++) if (m !== n) f.pairZ[n][m] = (pair[n][m] - D * PAIR_P) / pairSd;
  }
  return f;
}

// ---- Gumbel-Rauschen für alternative Tipps ----
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function patternPenalty(nums) {
  const sum = nums.reduce((s, x) => s + x, 0);
  const even = nums.filter((n) => n % 2 === 0).length;
  const low = nums.filter((n) => n <= 24).length;
  let pen = 0.5 * ((sum - SUM_MEAN) / SUM_SD) ** 2;
  if (even < 2 || even > 4) pen += 2;
  if (low < 2 || low > 4) pen += 2;
  return pen;
}

// Beam-Search über Zahlenmengen
export function pickNumbers(features, weights = DEFAULT_WEIGHTS, { noise = 0, seed = 1, beam = 60 } = {}) {
  const rnd = mulberry(seed);
  const base = [];
  for (let n = 1; n <= N; n++) {
    const g = noise ? -Math.log(-Math.log(Math.max(1e-12, rnd()))) * noise : 0;
    base[n] = weights.overall * features.overall[n] + weights.recent * features.recent[n] + weights.overdue * features.overdue[n] + g;
  }
  const pw = 0.4 * weights.pair;
  let states = [{ nums: [], score: 0 }];
  for (let k = 0; k < K; k++) {
    const seen = new Set();
    const next = [];
    for (const s of states) {
      for (let n = 1; n <= N; n++) {
        if (s.nums.includes(n)) continue;
        const nums = [...s.nums, n].sort((a, b) => a - b);
        const key = nums.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        let ps = 0;
        for (const m of s.nums) ps += features.pairZ[m][n];
        next.push({ nums, score: s.score + base[n] + pw * ps });
      }
    }
    next.sort((a, b) => b.score - a.score);
    states = next.slice(0, beam);
  }
  if (weights.patterns) states.forEach((s) => { s.score -= patternPenalty(s.nums); });
  states.sort((a, b) => b.score - a.score);
  const best = states[0];
  return {
    numbers: best.nums,
    score: best.score,
    detail: best.nums.map((n) => ({
      n,
      overall: features.overall[n],
      recent: features.recent[n],
      overdue: features.overdue[n],
      pair: best.nums.filter((m) => m !== n).reduce((s, m) => s + features.pairZ[n][m], 0) / (K - 1),
      score: base[n],
    })),
    sum: best.nums.reduce((s, x) => s + x, 0),
  };
}

// Score aller Zahlen (für das Diagramm)
export function numberScores(features, weights) {
  return Array.from({ length: N }, (_, i) => {
    const n = i + 1;
    const o = weights.overall * features.overall[n];
    const r = weights.recent * features.recent[n];
    const d = weights.overdue * features.overdue[n];
    return { n, overall: +o.toFixed(2), recent: +r.toFixed(2), overdue: +d.toFixed(2), score: +(o + r + d).toFixed(2) };
  });
}

// ---- Backtest: Walk-forward über die letzten `steps` Ziehungen ----
export function backtest(draws, weights, steps = 150) {
  const start = Math.max(RECENT_WINDOW + 20, draws.length - steps);
  const hist = Array(K + 1).fill(0);
  let hits = 0, n = 0;
  const randHist = Array(K + 1).fill(0);
  const rnd = mulberry(42);
  for (let t = start; t < draws.length; t++) {
    const f = buildFeatures(draws.slice(0, t));
    const pick = pickNumbers(f, weights, { beam: 25 }).numbers;
    const actual = new Set(draws[t].numbers);
    const h = pick.filter((x) => actual.has(x)).length;
    hist[h]++; hits += h; n++;
    // Vergleich: zufällige Tipps
    const pool = Array.from({ length: N }, (_, i) => i + 1);
    for (let i = 0; i < K; i++) { const j = i + Math.floor(rnd() * (N - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    randHist[pool.slice(0, K).filter((x) => actual.has(x)).length]++;
  }
  const exp = (K * K) / N; // erwartete Treffer pro Tipp bei Zufall
  const varH = ((K * K) / N) * (1 - K / N) * ((N - K) / (N - 1));
  const mean = hits / n;
  const z = (mean - exp) / Math.sqrt(varH / n);
  return { n, mean, expected: exp, z, hist, randHist, hits3: hist.slice(3).reduce((s, x) => s + x, 0) };
}

// ---- Termin der nächsten Ziehung (Mi/Sa) ----
export function nextDrawDate(lastDate) {
  const d = new Date(lastDate);
  do { d.setDate(d.getDate() + 1); } while (d.getDay() !== 3 && d.getDay() !== 6);
  return d;
}
