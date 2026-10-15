// Speichert Prognosen fix in der Datenbank, wertet sie aus, sobald die echte Ziehung vorliegt,
// und erstellt danach die Prognose für die nächste Ziehung.
import { K } from '../src/stats.js';
import { DEFAULT_WEIGHTS, buildFeatures, nextDrawDate, pickNumbers } from '../src/predict.js';
import { dateToIso, exportPredictions, getDraws, getPredictions, insertPrediction, saveResult, toDe, transaction } from './db.mjs';

const MODEL_VERSION = 1;
const DRAW_TIME_HOUR = 18; // Prognosen werden nur vor der Ziehung erstellt (Ziehung ca. 18:25 Uhr)

/**
 * 1. wertet offene Prognosen aus, deren Ziehung jetzt in der DB steht
 * 2. erstellt (einmalig, danach unveränderlich) die Prognose für die nächste Ziehung
 * Liefert { predictions, evaluated: [drawDate…], created: drawDate | null, nextDraw }
 */
export function syncPredictions({ db, now = new Date(), exportFile } = {}) {
  const draws = getDraws(db);
  const byDate = new Map(draws.map((d) => [toDe(d.iso), d]));
  const evaluated = [];
  let created = null;

  const next = nextDrawDate(draws[draws.length - 1].date);
  const nextKey = toDe(dateToIso(next));
  const cutoff = new Date(next.getFullYear(), next.getMonth(), next.getDate(), DRAW_TIME_HOUR);

  transaction(db, () => {
    for (const p of getPredictions(db)) {
      if (p.result) continue;
      const draw = byDate.get(p.drawDate);
      if (!draw) continue;
      const actual = [...draw.numbers].sort((a, b) => a - b);
      const hitNumbers = p.numbers.filter((n) => actual.includes(n));
      saveResult(db, p.drawDate, { actual, hitNumbers, hits: hitNumbers.length, hitRate: hitNumbers.length / K, evaluatedAt: now.toISOString() });
      evaluated.push(p.drawDate);
    }

    if (now < cutoff && !getPredictions(db).some((p) => p.drawDate === nextKey)) {
      const pick = pickNumbers(buildFeatures(draws), DEFAULT_WEIGHTS);
      insertPrediction(db, {
        drawDate: nextKey,
        createdAt: now.toISOString(),
        basedOnDraws: draws.length,
        basedOnLastDraw: toDe(draws[draws.length - 1].iso),
        modelVersion: MODEL_VERSION,
        weights: { ...DEFAULT_WEIGHTS },
        numbers: pick.numbers,
        sum: pick.sum,
        result: null,
      });
      created = nextKey;
    }
  });

  if (evaluated.length || created) exportPredictions(db, exportFile);
  return { predictions: getPredictions(db), evaluated, created, nextDraw: nextKey };
}
