// SQLite-Datenbank (eingebautes node:sqlite, keine zusätzliche Abhängigkeit).
// Tabellen: draws (gezogene Zahlen) und predictions (Prognosen inkl. Auswertung).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DB_FILE = process.env.LOTTO_DB || path.join(ROOT, 'lotto.db');
export const SEED_CSV = process.env.LOTTO_CSV || path.join(ROOT, 'lottozahlen.csv');
export const PRED_BACKUP = process.env.LOTTO_PRED || path.join(ROOT, 'prognosen.json');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS draws (
  draw_date TEXT PRIMARY KEY,               -- ISO: YYYY-MM-DD
  n1 INTEGER NOT NULL CHECK (n1 BETWEEN 1 AND 49),
  n2 INTEGER NOT NULL CHECK (n2 BETWEEN 1 AND 49),
  n3 INTEGER NOT NULL CHECK (n3 BETWEEN 1 AND 49),
  n4 INTEGER NOT NULL CHECK (n4 BETWEEN 1 AND 49),
  n5 INTEGER NOT NULL CHECK (n5 BETWEEN 1 AND 49),
  n6 INTEGER NOT NULL CHECK (n6 BETWEEN 1 AND 49),
  source TEXT NOT NULL DEFAULT 'csv'        -- csv | api
);
CREATE TABLE IF NOT EXISTS predictions (
  draw_date TEXT PRIMARY KEY,               -- Ziehung, für die getippt wurde
  created_at TEXT NOT NULL,
  based_on_draws INTEGER NOT NULL,
  based_on_last_draw TEXT NOT NULL,
  model_version INTEGER NOT NULL,
  weights TEXT NOT NULL,                    -- JSON
  n1 INTEGER NOT NULL, n2 INTEGER NOT NULL, n3 INTEGER NOT NULL,
  n4 INTEGER NOT NULL, n5 INTEGER NOT NULL, n6 INTEGER NOT NULL,   -- aufsteigend sortiert
  sum INTEGER NOT NULL,
  actual TEXT,                              -- JSON: gezogene Zahlen (nach Auswertung)
  hit_numbers TEXT,                         -- JSON
  hits INTEGER,
  hit_rate REAL,                            -- hits / 6
  evaluated_at TEXT
);
`;

// ---- Datumshilfen: DB = ISO, UI/CSV = TT.MM.JJJJ ----
export const toIso = (de) => { const [d, m, y] = de.split('.'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; };
export const toDe = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
export const isoToDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const dateToIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function transaction(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function openDb(file = DB_FILE) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

// ---- Draws ----
/** rows: [{ iso, numbers[6] }] – bereits vorhandene Daten werden ignoriert. Gibt die neu eingefügten zurück. */
export function insertDraws(db, rows, source = 'api') {
  const stmt = db.prepare('INSERT OR IGNORE INTO draws (draw_date, n1, n2, n3, n4, n5, n6, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  return transaction(db, () => rows.filter((r) => stmt.run(r.iso, ...r.numbers, source).changes > 0));
}

export function getDraws(db) {
  return db.prepare('SELECT * FROM draws ORDER BY draw_date').all().map((r) => ({
    iso: r.draw_date,
    date: isoToDate(r.draw_date),
    numbers: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6],
  }));
}

export const lastDrawIso = (db) => db.prepare('SELECT MAX(draw_date) AS d FROM draws').get().d;

// ---- Predictions ----
const toPrediction = (r) => ({
  drawDate: toDe(r.draw_date),
  createdAt: r.created_at,
  basedOnDraws: r.based_on_draws,
  basedOnLastDraw: toDe(r.based_on_last_draw),
  modelVersion: r.model_version,
  weights: JSON.parse(r.weights),
  numbers: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6],
  sum: r.sum,
  result: r.evaluated_at
    ? { actual: JSON.parse(r.actual), hits: r.hits, hitNumbers: JSON.parse(r.hit_numbers), hitRate: r.hit_rate, evaluatedAt: r.evaluated_at }
    : null,
});

export const getPredictions = (db) => db.prepare('SELECT * FROM predictions ORDER BY draw_date').all().map(toPrediction);

export function insertPrediction(db, p) {
  db.prepare(`INSERT INTO predictions (draw_date, created_at, based_on_draws, based_on_last_draw, model_version, weights,
              n1, n2, n3, n4, n5, n6, sum, actual, hit_numbers, hits, hit_rate, evaluated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(toIso(p.drawDate), p.createdAt, p.basedOnDraws, toIso(p.basedOnLastDraw), p.modelVersion, JSON.stringify(p.weights),
      ...p.numbers, p.sum,
      p.result ? JSON.stringify(p.result.actual) : null, p.result ? JSON.stringify(p.result.hitNumbers) : null,
      p.result?.hits ?? null, p.result?.hitRate ?? null, p.result?.evaluatedAt ?? null);
}

export function saveResult(db, drawDate, result) {
  db.prepare('UPDATE predictions SET actual = ?, hit_numbers = ?, hits = ?, hit_rate = ?, evaluated_at = ? WHERE draw_date = ? AND evaluated_at IS NULL')
    .run(JSON.stringify(result.actual), JSON.stringify(result.hitNumbers), result.hits, result.hitRate, result.evaluatedAt, toIso(drawDate));
}

/** Lesbares Backup der Prognosen (wird bei jeder Änderung neu geschrieben, liegt im Git) */
export function exportPredictions(db, file = PRED_BACKUP) {
  fs.writeFileSync(file, JSON.stringify(getPredictions(db), null, 2) + '\n');
}

// ---- Erstbefüllung aus CSV / prognosen.json (nur wenn die Tabellen leer sind) ----
export function importCsv(db, csvPath = SEED_CSV) {
  const rows = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((line) => {
    const [d, ...nums] = line.split(';');
    return { iso: toIso(d), numbers: nums.slice(0, 6).map(Number) };
  });
  return insertDraws(db, rows, 'csv').length;
}

function seed(db) {
  if (db.prepare('SELECT COUNT(*) AS c FROM draws').get().c === 0 && fs.existsSync(SEED_CSV)) importCsv(db);
  if (db.prepare('SELECT COUNT(*) AS c FROM predictions').get().c === 0 && fs.existsSync(PRED_BACKUP)) {
    const list = JSON.parse(fs.readFileSync(PRED_BACKUP, 'utf8'));
    transaction(db, () => list.forEach((p) => insertPrediction(db, p)));
  }
}
