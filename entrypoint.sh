#!/bin/sh
# Vorbereitung vor dem Start der App (CMD wird am Ende per exec übergeben)
set -eu

DATA_DIR="$(dirname "${LOTTO_DB:-/data/lotto.db}")"
mkdir -p "$DATA_DIR"

# Leeres Volume: vorhandene Prognosen aus dem Image übernehmen
if [ -n "${LOTTO_PRED:-}" ] && [ ! -f "$LOTTO_PRED" ] && [ -f /app/prognosen.json ]; then
  cp /app/prognosen.json "$LOTTO_PRED"
fi

# Datenbank anlegen/aktualisieren und Prognosen auswerten.
# Ein Fehler (z. B. kein Internet) darf den Start nicht verhindern.
node scripts/update-lotto.mjs || echo "WARNUNG: Datenbank-Update fehlgeschlagen – App startet mit vorhandenen Daten."

exec "$@"
