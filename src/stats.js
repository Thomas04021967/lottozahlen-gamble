// Statistik-Berechnungen für Lotto 6 aus 49
export const N = 49;
export const K = 6;

export function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [d, ...nums] = line.split(';');
      const [dd, mm, yyyy] = d.split('.').map(Number);
      const numbers = nums.slice(0, K).map(Number);
      return { date: new Date(yyyy, mm - 1, dd), numbers };
    })
    .filter((r) => r.numbers.length === K && r.numbers.every((n) => n >= 1 && n <= N));
}

// ---------- Verteilungsfunktionen ----------
function lnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// regularisierte untere Gammafunktion P(a, x)
function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 500; n++) {
      ap++;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

export const chiSquarePValue = (chi2, df) => 1 - gammaP(df / 2, chi2 / 2);

function erf(x) {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
export const twoSidedP = (z) => 2 * (1 - normalCdf(Math.abs(z)));

const lnChoose = (n, k) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
const hyper = (k, Ngood, Ntot, draws) =>
  Math.exp(lnChoose(Ngood, k) + lnChoose(Ntot - Ngood, draws - k) - lnChoose(Ntot, draws));

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const variance = (a) => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };

// Näherung der Normal-Quantilfunktion (Acklam)
function inverseNormal(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Erwartete Anzahl direkt aufeinanderfolgender Paare (Monte-Carlo mit festem Seed)
function simulateConsecutive(D) {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const trials = 200000;
  const c = Array(K).fill(0);
  const pool = Array.from({ length: N }, (_, i) => i + 1);
  for (let t = 0; t < trials; t++) {
    for (let i = 0; i < K; i++) {
      const j = i + Math.floor(rnd() * (N - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const s = pool.slice(0, K).sort((a, b) => a - b);
    let k = 0;
    for (let i = 1; i < K; i++) if (s[i] === s[i - 1] + 1) k++;
    c[k]++;
  }
  return c.map((x) => (x / trials) * D);
}

// ---------- Hauptberechnung ----------
export function analyze(draws) {
  const D = draws.length;
  const pn = K / N; // Wahrscheinlichkeit, dass eine Zahl in einer Ziehung vorkommt

  // 1. Häufigkeiten
  const counts = Array(N + 1).fill(0);
  const lastSeen = Array(N + 1).fill(-1);
  draws.forEach((d, i) => d.numbers.forEach((n) => { counts[n]++; lastSeen[n] = i; }));
  const expected = D * pn;
  const sd = Math.sqrt(D * pn * (1 - pn));
  const freq = [];
  for (let n = 1; n <= N; n++) {
    freq.push({ n, count: counts[n], z: (counts[n] - expected) / sd, since: D - 1 - lastSeen[n] });
  }
  const chi2 = freq.reduce((s, f) => s + (f.count - expected) ** 2 / expected, 0);
  const chiP = chiSquarePValue(chi2, N - 1);
  const expectedGap = 1 / pn - 1;

  // 2. Summenverteilung
  const sums = draws.map((d) => d.numbers.reduce((s, x) => s + x, 0));
  const sumMean = (K * (N + 1)) / 2;
  const sumSd = Math.sqrt((K * (N - K) * (N + 1)) / 12);
  const bin = 10;
  const sumBins = [];
  for (let lo = 60; lo < 250; lo += bin) {
    const c = sums.filter((s) => s >= lo && s < lo + bin).length;
    const pExp = normalCdf((lo + bin - 0.5 - sumMean) / sumSd) - normalCdf((lo - 0.5 - sumMean) / sumSd);
    sumBins.push({ label: `${lo}–${lo + bin - 1}`, count: c, expected: +(pExp * D).toFixed(1) });
  }

  // 3. Gerade/Ungerade & Niedrig/Hoch
  const evenCounts = Array(K + 1).fill(0);
  const lowCounts = Array(K + 1).fill(0);
  draws.forEach((d) => {
    evenCounts[d.numbers.filter((n) => n % 2 === 0).length]++;
    lowCounts[d.numbers.filter((n) => n <= 24).length]++;
  });
  const evenOdd = evenCounts.map((c, k) => ({
    label: `${k} g / ${K - k} u`, count: c, expected: +(hyper(k, 24, 49, K) * D).toFixed(1),
  }));
  const lowHigh = lowCounts.map((c, k) => ({
    label: `${k} nied. / ${K - k} hoch`, count: c, expected: +(hyper(k, 24, 49, K) * D).toFixed(1),
  }));

  // 4. Zehnergruppen
  const groups = ['1–9', '10–19', '20–29', '30–39', '40–49'];
  const groupCounts = Array(5).fill(0);
  draws.forEach((d) => d.numbers.forEach((n) => groupCounts[Math.min(4, Math.floor(n / 10))]++));
  const groupSizes = [9, 10, 10, 10, 10];
  const decades = groups.map((g, i) => ({ label: g, count: groupCounts[i], expected: +((D * K * groupSizes[i]) / N).toFixed(1) }));

  // 5. Aufeinanderfolgende Zahlen
  const consecCounts = Array(K).fill(0);
  draws.forEach((d) => {
    const s = [...d.numbers].sort((a, b) => a - b);
    let c = 0;
    for (let i = 1; i < K; i++) if (s[i] === s[i - 1] + 1) c++;
    consecCounts[c]++;
  });
  const consecExp = simulateConsecutive(D);
  const consecutive = consecCounts.slice(0, 4).map((c, k) => ({ label: `${k} Paare`, count: c, expected: +consecExp[k].toFixed(1) }));
  const consecShare = (D - consecCounts[0]) / D;
  const consecExpShare = 1 - consecExp[0] / D;

  // 6. Paar-Matrix
  const pair = Array.from({ length: N + 1 }, () => Array(N + 1).fill(0));
  draws.forEach((d) => {
    for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) {
      const a = d.numbers[i], b = d.numbers[j];
      pair[a][b]++; pair[b][a]++;
    }
  });
  const pPair = (K * (K - 1)) / (N * (N - 1));
  const pairExp = D * pPair;
  const pairSd = Math.sqrt(D * pPair * (1 - pPair));
  const pairList = [];
  for (let a = 1; a <= N; a++) for (let b = a + 1; b <= N; b++) {
    pairList.push({ a, b, count: pair[a][b], z: (pair[a][b] - pairExp) / pairSd });
  }
  const topPairs = [...pairList].sort((x, y) => y.count - x.count || y.z - x.z).slice(0, 10);
  const maxAbsZPair = Math.max(...pairList.map((p) => Math.abs(p.z)));
  const nPairs = pairList.length;
  const sigPairs = pairList.filter((p) => twoSidedP(p.z) < 0.05).length;
  const expectedSigPairs = nPairs * 0.05;
  const bonferroniZ = Math.abs(inverseNormal(0.05 / (2 * nPairs)));

  // 7. Wiederholungen aus der Vorziehung (hypergeometrisch)
  const overlapCounts = Array(K + 1).fill(0);
  for (let i = 1; i < D; i++) {
    const prev = new Set(draws[i - 1].numbers);
    overlapCounts[draws[i].numbers.filter((n) => prev.has(n)).length]++;
  }
  const overlap = overlapCounts.slice(0, 5).map((c, k) => ({
    label: `${k} gleiche`, count: c, expected: +(hyper(k, K, N, K) * (D - 1)).toFixed(1),
  }));

  // 8. Autokorrelation der Ziehungssumme
  const sm = mean(sums);
  const sv = sums.reduce((s, x) => s + (x - sm) ** 2, 0);
  const acf = [];
  for (let lag = 1; lag <= 20; lag++) {
    let c = 0;
    for (let i = 0; i + lag < D; i++) c += (sums[i] - sm) * (sums[i + lag] - sm);
    acf.push({ lag, r: +(c / sv).toFixed(4) });
  }
  const acfLimit = 1.96 / Math.sqrt(D);

  // 9. Wochentage
  const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const dayCounts = Array(7).fill(0);
  draws.forEach((d) => dayCounts[d.date.getDay()]++);
  const weekdays = dayCounts.map((c, i) => ({ label: dayNames[i], count: c })).filter((x) => x.count > 0);

  // 10. Verlauf der Summe mit gleitendem Mittel
  const win = 26;
  const sumTrend = sums.map((s, i) => ({
    i: i + 1,
    date: fmtDate(draws[i].date),
    sum: s,
    avg: i >= win - 1 ? +mean(sums.slice(i - win + 1, i + 1)).toFixed(1) : null,
  }));

  // 11. Chi² je Jahr
  const years = [...new Set(draws.map((d) => d.date.getFullYear()))];
  const yearly = years.map((y) => {
    const sub = draws.filter((d) => d.date.getFullYear() === y);
    const c = Array(N + 1).fill(0);
    sub.forEach((d) => d.numbers.forEach((n) => c[n]++));
    const e = sub.length * pn;
    const x2 = c.slice(1).reduce((s, v) => s + (v - e) ** 2 / e, 0);
    return { year: String(y), draws: sub.length, chi2: +x2.toFixed(1), p: chiSquarePValue(x2, N - 1) };
  });

  // 12. Abstände zwischen Auftreten derselben Zahl vs. geometrische Verteilung
  const gaps = [];
  for (let n = 1; n <= N; n++) {
    let prev = -1;
    draws.forEach((d, i) => {
      if (d.numbers.includes(n)) { if (prev >= 0) gaps.push(i - prev - 1); prev = i; }
    });
  }
  const maxGap = 25;
  const gapHist = Array(maxGap + 1).fill(0);
  gaps.forEach((g) => gapHist[Math.min(g, maxGap)]++);
  const gapDist = gapHist.map((c, g) => ({
    label: g === maxGap ? `${g}+` : `${g}`,
    count: c,
    expected: +(gaps.length * (g === maxGap ? (1 - pn) ** g : pn * (1 - pn) ** g)).toFixed(1),
  }));

  return {
    D, expected, sd, freq, chi2, chiP, expectedGap,
    sums, sumMean, sumSd, sumObsMean: sm, sumObsSd: Math.sqrt(variance(sums)), sumBins,
    evenOdd, lowHigh, decades, consecutive, consecShare, consecExpShare,
    pair, pairList, topPairs, maxAbsZPair, sigPairs, expectedSigPairs, nPairs, bonferroniZ,
    overlap, acf, acfLimit, weekdays, sumTrend, yearly, gapDist, gapMean: mean(gaps),
    first: draws[0].date, last: draws[D - 1].date,
  };
}

// ---------- Vergleich: letzte X Tage vs. davor ----------
export function compareRecent(draws, days = 180) {
  const lastDate = draws[draws.length - 1].date;
  const cutoff = new Date(lastDate);
  cutoff.setDate(cutoff.getDate() - days);
  const recent = draws.filter((d) => d.date > cutoff);
  const earlier = draws.filter((d) => d.date <= cutoff);
  const nR = recent.length, nE = earlier.length;

  const cnt = (set) => {
    const c = Array(N + 1).fill(0);
    set.forEach((d) => d.numbers.forEach((n) => c[n]++));
    return c;
  };
  const cR = cnt(recent), cE = cnt(earlier);

  // je Zahl: Anteil der Ziehungen, in denen sie vorkam (in %)
  const perNumber = [];
  let chi2 = 0;
  for (let n = 1; n <= N; n++) {
    const pR = cR[n] / nR, pE = cE[n] / nE;
    const pooled = (cR[n] + cE[n]) / (nR + nE);
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / nR + 1 / nE));
    const z = se ? (pR - pE) / se : 0;
    perNumber.push({ n, recent: cR[n], earlier: cE[n], pctR: +(pR * 100).toFixed(1), pctE: +(pE * 100).toFixed(1), diff: +((pR - pE) * 100).toFixed(1), z });
    // Homogenitäts-χ² (2x2 je Zahl: kam vor / kam nicht vor)
    const tot = nR + nE;
    for (const [obs, nGrp] of [[cR[n], nR], [cE[n], nE]]) {
      const e1 = (nGrp * (cR[n] + cE[n])) / tot;
      const e0 = nGrp - e1;
      chi2 += (obs - e1) ** 2 / e1 + (nGrp - obs - e0) ** 2 / e0;
    }
  }
  const chiP = chiSquarePValue(chi2, N - 1);
  const movers = [...perNumber].sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

  // Kennzahlen je Ziehung (Welch-z-Test)
  const metric = (fn) => {
    const r = recent.map(fn), e = earlier.map(fn);
    const mR = mean(r), mE = mean(e);
    const z = (mR - mE) / Math.sqrt(variance(r) / nR + variance(e) / nE);
    return { recent: mR, earlier: mE, z, p: twoSidedP(z) };
  };
  const metrics = [
    { key: 'sum', label: 'Ø Summe', ...metric((d) => d.numbers.reduce((s, x) => s + x, 0)) },
    { key: 'even', label: 'Ø gerade Zahlen', ...metric((d) => d.numbers.filter((n) => n % 2 === 0).length) },
    { key: 'low', label: 'Ø Zahlen 1–24', ...metric((d) => d.numbers.filter((n) => n <= 24).length) },
    { key: 'spread', label: 'Ø Spannweite (max – min)', ...metric((d) => Math.max(...d.numbers) - Math.min(...d.numbers)) },
    { key: 'consec', label: 'Ø Nachbarpaare', ...metric((d) => { const s = [...d.numbers].sort((a, b) => a - b); return s.slice(1).filter((x, i) => x === s[i] + 1).length; }) },
  ];

  // Zehnergruppen (Anteil aller gezogenen Zahlen in %)
  const groups = ['1–9', '10–19', '20–29', '30–39', '40–49'];
  const gc = (set) => { const c = Array(5).fill(0); set.forEach((d) => d.numbers.forEach((n) => c[Math.min(4, Math.floor(n / 10))]++)); return c; };
  const gR = gc(recent), gE = gc(earlier);
  const decades = groups.map((label, i) => ({
    label,
    recent: +((gR[i] / (nR * K)) * 100).toFixed(1),
    earlier: +((gE[i] / (nE * K)) * 100).toFixed(1),
  }));

  // Summenklassen (Anteil der Ziehungen in %)
  const sumClasses = [[0, 109], [110, 129], [130, 149], [150, 169], [170, 189], [190, 300]];
  const sumsR = recent.map((d) => d.numbers.reduce((s, x) => s + x, 0));
  const sumsE = earlier.map((d) => d.numbers.reduce((s, x) => s + x, 0));
  const sumDist = sumClasses.map(([lo, hi]) => ({
    label: lo === 0 ? `bis ${hi}` : hi === 300 ? `ab ${lo}` : `${lo}–${hi}`,
    recent: +((sumsR.filter((s) => s >= lo && s <= hi).length / nR) * 100).toFixed(1),
    earlier: +((sumsE.filter((s) => s >= lo && s <= hi).length / nE) * 100).toFixed(1),
  }));

  return {
    days, nR, nE, firstR: recent[0].date, lastE: earlier[earlier.length - 1].date,
    perNumber, chi2, chiP, movers, metrics, decades, sumDist,
  };
}

export const fmtDate = (d) => d.toLocaleDateString('de-DE');
export const fmtP = (p) => (p < 0.001 ? '< 0,001' : p.toFixed(3).replace('.', ','));
export const fmt1 = (x) => x.toFixed(1).replace('.', ',');
