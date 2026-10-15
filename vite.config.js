import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { getDraws, openDb } from './scripts/db.mjs';
import { updateDraws } from './scripts/update-lotto.mjs';
import { syncPredictions } from './scripts/predictions.mjs';

// Stellt die SQLite-Daten als kleine API bereit (dev & preview).
//   GET  /api/draws       -> alle Ziehungen als JSON [{ date: 'YYYY-MM-DD', numbers: [6] }]
//   POST /api/update      -> Vergleich mit letztem Ziehungstermin, ggf. neue Zahlen holen und speichern,
//                            danach Prognosen auswerten bzw. neue Prognose erstellen
//   GET  /api/predictions -> gespeicherte Prognosen (inkl. Auswertung)
function lottoApi() {
  let db;
  const json = (res, body, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };
  const handler = async (req, res, next) => {
    const url = req.url.split('?')[0];
    try {
      if (url === '/api/draws' && req.method === 'GET') {
        db ??= openDb();
        json(res, getDraws(db).map((d) => ({ date: d.iso, numbers: d.numbers })));
      } else if (url === '/api/update' && req.method === 'POST') {
        db ??= openDb();
        const update = await updateDraws({ db });
        const sync = syncPredictions({ db });
        json(res, { ...update, predictions: { evaluated: sync.evaluated, created: sync.created } });
      } else if (url === '/api/predictions' && req.method === 'GET') {
        db ??= openDb();
        const { predictions, nextDraw } = syncPredictions({ db });
        json(res, { predictions, nextDraw });
      } else next();
    } catch (e) {
      json(res, { status: 'error', message: String(e.message || e) }, 502);
    }
  };
  return {
    name: 'lotto-api',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

export default defineConfig({
  plugins: [react(), lottoApi()],
  preview: { allowedHosts: true }, // Zugriff auch über Hostnamen/IP (z. B. aus Docker)
});
