# Lotto-Statistik: Vite-Build + Preview-Server (liefert die App und die SQLite-API aus)
FROM node:24-alpine

# Ziehungszeiten (Mi/Sa 18:25) und Prognose-Stichtage rechnen in lokaler Zeit
RUN apk add --no-cache tzdata
ENV TZ=Europe/Berlin

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Daten (SQLite-DB + Prognosen-Backup) liegen im Volume /data
ENV LOTTO_DB=/data/lotto.db \
    LOTTO_PRED=/data/prognosen.json \
    NODE_ENV=production
VOLUME /data
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO /dev/null http://127.0.0.1:4173/api/draws || exit 1

# Vorbereitung (Volume, DB-Update) übernimmt das Entrypoint-Skript.
# Windows-Zeilenenden (CRLF) entfernen und Skript ausführbar machen, damit es immer startet.
RUN sed -i 's/[[:cntrl:]]$//' entrypoint.sh && chmod +x entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "4173"]
