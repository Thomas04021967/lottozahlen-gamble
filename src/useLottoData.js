import { useCallback, useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL = 30 * 60 * 1000; // alle 30 Minuten
const MIN_GAP = 60 * 1000; // Fokus-Checks höchstens einmal pro Minute

const toDraws = (rows) => rows.map((r) => {
  const [y, m, d] = r.date.split('-').map(Number);
  return { date: new Date(y, m - 1, d), numbers: r.numbers };
});

async function getJson(url, init) {
  const res = await fetch(url, { cache: 'no-store', ...init });
  if (!(res.headers.get('content-type') || '').includes('json')) throw new Error('offline'); // kein Server-API
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
  return body;
}

// Lädt Ziehungen und Prognosen aus der SQLite-DB (über die Server-API) und prüft auf neue Zahlen.
// Bei neuen Ziehungen werden die Daten neu geladen – alle abhängigen Berechnungen (useMemo auf `draws`)
// laufen dann automatisch neu.
export function useLottoData() {
  const [draws, setDraws] = useState(null); // null = noch nicht geladen
  const [loadError, setLoadError] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [status, setStatus] = useState({ phase: 'idle', result: null, checkedAt: null, error: null });
  const lastCheck = useRef(0);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const rows = await getJson('/api/draws');
    setDraws((old) => (old && old.length === rows.length && old.at(-1).numbers.join() === rows.at(-1).numbers.join() ? old : toDraws(rows)));
    setPredictions(await getJson('/api/predictions'));
  }, []);

  const check = useCallback(async (force = false) => {
    if (busy.current || (!force && Date.now() - lastCheck.current < MIN_GAP)) return;
    busy.current = true;
    lastCheck.current = Date.now();
    setStatus((s) => ({ ...s, phase: 'checking', error: null }));
    try {
      const result = await getJson('/api/update', { method: 'POST' });
      await load();
      setStatus({ phase: 'done', result, checkedAt: new Date(), error: null });
    } catch (e) {
      setStatus({ phase: 'done', result: null, checkedAt: new Date(), error: e.message });
    } finally {
      busy.current = false;
    }
  }, [load]);

  useEffect(() => {
    load().catch((e) => setLoadError(e.message)).then(() => check(true));
    const timer = setInterval(() => check(), CHECK_INTERVAL);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [load, check]);

  return { draws, loadError, status, predictions, check: () => check(true) };
}
