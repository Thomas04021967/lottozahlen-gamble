# Lotto-Statistik 6 aus 49

A React dashboard that analyses all German Lotto "6 aus 49" draws since 2020: distributions, correlations, randomness tests and a (just for fun) prediction for the next draw, including a persistent track record of how well the predictions performed.

> **Disclaimer:** Lottery draws are random and independent. The statistics describe the past and the prediction is entertainment. The built-in backtest shows that the model does not beat random guessing.

The user interface is in German.

## Features

- **Frequency analysis:** how often each number was drawn, hot/cold numbers, "overdue" numbers, χ² test for uniform distribution.
- **Patterns:** sum of numbers, even/odd, low/high, number ranges, consecutive numbers, repeats from the previous draw, gaps between appearances (each compared with the expected distribution for pure chance).
- **Correlations:** pair heatmap for all 1,176 number pairs (z-scores, Bonferroni-corrected), most frequent pairs, autocorrelation of draw sums.
- **Time:** sum trend with moving average, χ² per year, draw weekdays.
- **Last 180 days vs. before:** per-number change, key figures with significance tests, range and sum distributions.
- **Prediction for the next draw** (button in the header):
  - The tip is calculated once per upcoming draw from frequency, recent form, overdue and pair affinity, and then stored **fixed** in the database.
  - As soon as the real draw is available, hits and hit rate are calculated and stored. Then the prediction for the following draw is created from the updated data.
  - History with hit rate versus pure chance, plus an experiment lab (sliders, backtest) whose tips are *not* stored.
- **Automatic updates:** new draws (Wednesday and Saturday) are fetched from a public archive; all statistics are recalculated.

## Requirements

| Usage | Needs |
|---|---|
| Local | Node.js 23 or newer (tested with 23.5 and 24) and npm. The built-in `node:sqlite` module is used, no native packages. |
| Container | Docker (with Compose). |

Node prints an "ExperimentalWarning" for `node:sqlite` on start. This is harmless.

## Usage: local

```bash
npm install
npm run dev        # http://localhost:5173
```

On start, `npm run dev` creates/updates the database first (see [Data](#data)). The page checks for new draws when it opens, every 30 minutes and when you return to the browser tab; the **Jetzt prüfen** button triggers a check manually.

Other commands:

| Command | Purpose |
|---|---|
| `npm run dev` | Development server with hot reload (runs `npm run update` first) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the production build incl. the API (http://localhost:4173) |
| `npm run update` | Fetches new draws, evaluates predictions, creates the next prediction |
| `npm run import:csv` | Re-imports `lottozahlen.csv` into the database (existing draws are ignored) |

> The app needs the Vite server (`dev` or `preview`): it provides the API that reads and writes the SQLite database. Opening the built files from a static web server does not work.

## Usage: container

```bash
docker compose up --build      # http://localhost:4173
```

Without Compose:

```bash
docker build -t lotto-qdk .
docker run -d --name lotto -p 4173:4173 -v lotto-data:/data lotto-qdk
```

How the container works:

- `ENTRYPOINT` (`entrypoint.sh`) prepares everything: creates `/data`, seeds the existing predictions into an empty volume and updates the database. If the update fails (e.g. no internet), the app still starts with the existing data.
- `CMD` only starts the app (`vite preview` on port 4173).
- The timezone is `Europe/Berlin` (draw times and prediction deadlines depend on it).
- A healthcheck queries `/api/draws`.
- The container needs internet access to fetch new draws.

**Persistence:** the database and the predictions backup live in the volume `lotto-data` (`/data`) and survive restarts and rebuilds.

```bash
docker compose down            # stop, data is kept
docker compose down -v         # stop and DELETE the data volume
docker compose logs -f lotto   # follow logs

# back up the volume to ./backup
docker run --rm -v lotto-qdk_lotto-data:/data -v "$PWD/backup:/backup" alpine cp -r /data/. /backup/
```

(With Compose the volume is prefixed with the project name, usually `lotto-qdk_lotto-data`; check with `docker volume ls`.)

New draws are only fetched when the container starts or while the page is open in a browser. If nobody opens the page, no new predictions or evaluations are created in the meantime. They are caught up on the next start or visit.

## Data

All data is stored in a **SQLite database** (`lotto.db`, git-ignored):

| Table | Content |
|---|---|
| `draws` | One row per draw: date (primary key, ISO), six numbers, source (`csv`/`api`) |
| `predictions` | One row per predicted draw: creation time, data basis, model version, weights, tip and, after the draw, actual numbers, hits and hit rate |

- On the first start the database is filled from `lottozahlen.csv` (CSV format: `DD.MM.YYYY;n1;n2;n3;n4;n5;n6`, numbers in drawing order).
- New draws come from the public [LottoNumberArchive](https://github.com/JohannesFriedrich/LottoNumberArchive) (no API key). The archive may be updated with a delay; the app reports "Ziehung fällig, aber noch nicht in der Datenquelle" and retries.
- `prognosen.json` is a readable **backup export** of the predictions, rewritten on every change and committed to git. If the database is deleted, the predictions are restored from it.
- Predictions are only created *before* the draw (until 18:00 on the draw day), so they can never be based on already known numbers.

Environment variables (optional):

| Variable | Default | Meaning |
|---|---|---|
| `LOTTO_DB` | `./lotto.db` (`/data/lotto.db` in Docker) | Database file |
| `LOTTO_PRED` | `./prognosen.json` (`/data/prognosen.json` in Docker) | Predictions backup file |
| `LOTTO_CSV` | `./lottozahlen.csv` | Seed CSV for an empty database |

## API

Provided by the Vite dev/preview server:

| Endpoint | Description |
|---|---|
| `GET /api/draws` | All draws as JSON `[{ "date": "YYYY-MM-DD", "numbers": [6] }]` |
| `POST /api/update` | Checks against the latest draw date, fetches new draws if needed, evaluates predictions, creates the next one |
| `GET /api/predictions` | All stored predictions incl. evaluation |

## Project structure

```
lottozahlen.csv            seed data (draws since 2020)
prognosen.json             predictions backup (generated)
scripts/
  db.mjs                   SQLite schema and data access
  update-lotto.mjs         fetches new draws (also CLI: npm run update)
  predictions.mjs          store, evaluate and create predictions
src/
  stats.js                 statistics (χ², z-tests, pairs, comparisons, …)
  predict.js               prediction model and backtest
  useLottoData.js          loads data, checks for updates
  App.jsx                  dashboard page
  components/              heatmap, 180-day comparison, prediction dialog, status bar
vite.config.js             Vite config + API plugin
Dockerfile, entrypoint.sh, docker-compose.yml
```

## Tech stack

React 18, Vite, Recharts, SQLite (`node:sqlite`), Docker.
