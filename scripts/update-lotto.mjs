// Aktualisiert die Datenbank mit neuen Ziehungen (Mittwoch & Samstag).
// CLI:  npm run update   (läuft auch automatisch vor `npm run dev`)
// Modul: updateDraws() wird vom Vite-Plugin für den Button/Auto-Check im Dashboard genutzt.
import { pathToFileURL } from 'node:url';
import { dateToIso, getDraws, importCsv, insertDraws, isoToDate, lastDrawIso, openDb, toDe, toIso } from './db.mjs';
import { syncPredictions } from './predictions.mjs';

const API = 'https://johannesfriedrich.github.io/LottoNumberArchive/Lottonumbers_complete.json';
const DRAW_DAYS = [3, 6]; // Mittwoch, Samstag (JS: 0 = Sonntag)
const DRAW_HOUR = 20; // Ziehung ca. 18:25 Uhr; Ergebnisse stehen danach zur Verfügung

// jüngster Ziehungstermin, dessen Ergebnis schon vorliegen sollte
export function latestDrawDate(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (DRAW_DAYS.includes(d.getDay()) && now.getHours() < DRAW_HOUR) d.setDate(d.getDate() - 1);
  while (!DRAW_DAYS.includes(d.getDay())) d.setDate(d.getDate() - 1);
  return d;
}

/**
 * Vergleicht die letzte Ziehung in der DB mit dem letzten Ziehungstermin und holt bei Bedarf neue Ziehungen.
 * status: 'current'     – DB ist aktuell (kein API-Aufruf)
 *         'unavailable' – Ziehung fällig, API hat sie aber noch nicht
 *         'added'       – neue Ziehungen wurden gespeichert
 */
export async function updateDraws({ db, now = new Date() }) {
  const lastIso = lastDrawIso(db);
  const expectedIso = dateToIso(latestDrawDate(now));
  const base = { lastDate: toDe(lastIso), expected: toDe(expectedIso), added: [] };

  if (lastIso >= expectedIso) return { ...base, status: 'current' };

  const res = await fetch(API, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`API-Fehler: HTTP ${res.status}`);
  const { data } = await res.json();

  const fresh = data
    .map((r) => ({ iso: toIso(r.date), numbers: r.Lottozahl }))
    .filter((r) => r.iso > lastIso && r.numbers?.length === 6)
    .sort((a, b) => a.iso.localeCompare(b.iso));
  if (!fresh.length) return { ...base, status: 'unavailable' };

  const inserted = insertDraws(db, fresh, 'api');
  return {
    ...base,
    status: 'added',
    added: inserted.map((r) => [toDe(r.iso), ...r.numbers].join(';')),
    lastDate: toDe(inserted[inserted.length - 1].iso),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  if (process.argv.includes('--import-csv')) {
    console.log(`CSV-Import: ${importCsv(db)} neue Ziehung(en) in die Datenbank übernommen.`);
  }
  const r = await updateDraws({ db });
  console.log(`Letzte Ziehung in DB: ${r.lastDate} · letzter Ziehungstermin: ${r.expected}`);
  if (r.status === 'current') console.log('Datenbank ist aktuell – kein API-Aufruf nötig.');
  else if (r.status === 'unavailable') console.log('API enthält noch keine neueren Ziehungen (Archiv wird mit Verzögerung aktualisiert).');
  else console.log(`${r.added.length} neue Ziehung(en) gespeichert:\n${r.added.join('\n')}`);
  const p = syncPredictions({ db });
  if (p.evaluated.length) console.log(`Prognose(n) ausgewertet: ${p.evaluated.join(', ')}`);
  if (p.created) console.log(`Neue Prognose für ${p.created} gespeichert.`);
  console.log(`Ziehungen in DB: ${getDraws(db).length}`);
}
