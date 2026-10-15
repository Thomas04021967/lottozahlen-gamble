import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { twoSidedP, fmt1, fmtP, K, N } from '../stats.js';
import {
  DEFAULT_WEIGHTS, RECENT_WINDOW, backtest, buildFeatures, numberScores, pickNumbers,
} from '../predict.js';

const AXIS = { fontSize: 11, fill: 'var(--text-2)' };
const SLIDERS = [
  { key: 'overall', label: 'Gesamthäufigkeit', hint: 'Zahlen, die seit 2020 öfter gezogen wurden' },
  { key: 'recent', label: 'Aktuelle Form', hint: `Zahlen, die in den letzten ${RECENT_WINDOW} Ziehungen (≈ 180 Tage) häufig waren` },
  { key: 'overdue', label: 'Überfälligkeit', hint: 'Zahlen, die länger nicht gezogen wurden („Gambler’s Fallacy“)' },
  { key: 'pair', label: 'Paar-Affinität', hint: 'Zahlen, die oft gemeinsam mit den anderen Tipp-Zahlen kamen' },
];
const EXPECTED_HITS = (K * K) / N; // ≈ 0,73 Treffer pro Tipp bei reinem Raten
const signed = (x) => `${x >= 0 ? '+' : ''}${fmt1(x)}`;
const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
const parseDe = (s) => { const [d, m, y] = s.split('.').map(Number); return new Date(y, m - 1, d); };
const weekday = (s) => parseDe(s).toLocaleDateString('de-DE', { weekday: 'long' });
const when = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

function PickTick({ x, y, payload, picks }) {
  const on = picks.includes(payload.value);
  return (
    <text x={x} y={y + 12} textAnchor="middle" fontSize={on ? 12 : 10} fontWeight={on ? 800 : 400}
      fill={on ? 'var(--series-2)' : 'var(--text-3)'}>{payload.value}</text>
  );
}

// ---------- Gespeicherte Prognose + Erfolgsquote ----------
function SavedPredictions({ predictions }) {
  if (!predictions) {
    return (
      <p className="disclaimer">
        Das dauerhafte Speichern der Prognosen (<code>prognosen.json</code>) funktioniert nur mit laufendem <code>npm run dev</code> / <code>npm run preview</code>.
      </p>
    );
  }
  const list = predictions.predictions;
  const open = list.filter((p) => !p.result).pop();
  const done = list.filter((p) => p.result);
  const totalHits = done.reduce((s, p) => s + p.result.hits, 0);
  const avgHits = done.length ? totalHits / done.length : 0;
  const hitRate = done.length ? totalHits / (done.length * K) : 0;
  const best = done.reduce((m, p) => Math.max(m, p.result.hits), 0);
  const chart = done.map((p) => ({ label: p.drawDate.slice(0, 5), hits: p.result.hits, drawDate: p.drawDate }));

  return (
    <>
      {open ? (
        <div className="saved">
          <div className="saved-head">
            <b>Prognose für {weekday(open.drawDate)}, {open.drawDate}</b>
            <span className="badge ok">🔒 fix gespeichert</span>
          </div>
          <div className="tip-balls">{open.numbers.map((n) => <span key={n} className="big-ball">{n}</span>)}</div>
          <p className="sub" style={{ textAlign: 'center' }}>
            Erstellt am {when(open.createdAt)} auf Basis von {open.basedOnDraws} Ziehungen (bis {open.basedOnLastDraw}). Die Zahlen werden nicht mehr verändert –
            sobald die Ziehung vorliegt, wird die Trefferquote berechnet und die nächste Prognose erstellt.
          </p>
        </div>
      ) : (
        <p className="disclaimer">
          Zurzeit gibt es keine offene Prognose: Die Ziehung ist bereits gelaufen, aber die Zahlen sind noch nicht in der Datenquelle.
          Sobald sie vorliegen, wird die Prognose ausgewertet und die nächste erstellt.
        </p>
      )}

      <h3>Bisherige Prognosen & Erfolgsquote</h3>
      {done.length === 0 ? (
        <p className="sub">Noch keine ausgewertete Prognose. Die erste Auswertung erscheint, sobald die Ziehung vom {open?.drawDate ?? 'nächsten Termin'} in den Daten steht.</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi"><div className="v">{done.length}</div><div className="l">ausgewertete Prognosen</div></div>
            <div className="kpi"><div className="v">{avgHits.toFixed(2).replace('.', ',')}</div><div className="l">Ø Treffer (Zufall: {EXPECTED_HITS.toFixed(2).replace('.', ',')})</div></div>
            <div className="kpi"><div className="v">{pct(hitRate)}</div><div className="l">Trefferquote (Zufall: {pct(K / N)})</div></div>
            <div className="kpi"><div className="v">{best}</div><div className="l">bestes Ergebnis (Richtige)</div></div>
          </div>
          {done.length > 1 && (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={chart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, 6]} />
                <Tooltip cursor={{ fill: 'var(--grid)', opacity: 0.5 }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return <div className="tip"><b>{d.drawDate}</b><div>{d.hits} Richtige</div></div>;
                }} />
                <ReferenceLine y={EXPECTED_HITS} stroke="var(--series-2)" strokeDasharray="5 4" strokeWidth={2} />
                <Bar dataKey="hits" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="hist-wrap">
            <table>
              <thead><tr><th>Ziehung</th><th>Tipp</th><th>gezogen</th><th>Treffer</th><th>Quote</th></tr></thead>
              <tbody>
                {[...done].reverse().map((p) => (
                  <tr key={p.drawDate}>
                    <td>{p.drawDate}</td>
                    <td>{p.numbers.map((n) => <span key={n} className={`ball${p.result.hitNumbers.includes(n) ? ' hit' : ''}`}>{n}</span>)}</td>
                    <td className="nums">{p.result.actual.join(' · ')}</td>
                    <td>{p.result.hits}</td>
                    <td>{pct(p.result.hitRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub">Grün hinterlegte Zahlen waren Treffer. Die Quote ist Treffer ÷ 6 Zahlen; bei reinem Raten liegt sie langfristig bei {pct(K / N)}.</p>
        </>
      )}
    </>
  );
}

// ---------- Experimentier-Labor (nicht gespeichert) ----------
function Lab({ draws }) {
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [variant, setVariant] = useState(0);
  const w = useDeferredValue(weights);
  const features = useMemo(() => buildFeatures(draws), [draws]);
  const tip = useMemo(
    () => pickNumbers(features, w, variant ? { noise: 1.2, seed: variant * 7919 } : {}),
    [features, w, variant],
  );
  const scores = useMemo(() => numberScores(features, w), [features, w]);
  const bt = useMemo(() => backtest(draws, w), [draws, w]);
  const btP = twoSidedP(bt.z);
  const btHist = bt.hist.map((c, k) => ({
    label: `${k}`, model: +((c / bt.n) * 100).toFixed(1), random: +((bt.randHist[k] / bt.n) * 100).toFixed(1),
  })).slice(0, 5);
  const set = (key, v) => { setWeights((o) => ({ ...o, [key]: v })); setVariant(0); };

  return (
    <>
      <p className="sub">Hier kannst du mit den Signalen spielen. Diese Tipps werden <b>nicht</b> gespeichert und nicht ausgewertet.</p>
      <div className="tip-balls">{tip.numbers.map((n) => <span key={n} className="big-ball lab">{n}</span>)}</div>
      <div className="tip-actions">
        <span className="sub">{variant ? `Zufallsvariante #${variant}` : 'Bester Tipp laut Modell'} · Summe {tip.sum}</span>
        <button onClick={() => setVariant((v) => v + 1)}>🎲 Neue Variante</button>
        {variant > 0 && <button onClick={() => setVariant(0)}>Bester Tipp</button>}
      </div>

      <h3>Wie stark zählt welches Signal?</h3>
      <div className="sliders">
        {SLIDERS.map((s) => (
          <label key={s.key} title={s.hint}>
            <span>{s.label} <b>{fmt1(weights[s.key])}</b></span>
            <input type="range" min="0" max="2" step="0.1" value={weights[s.key]} onChange={(e) => set(s.key, +e.target.value)} />
            <small>{s.hint}</small>
          </label>
        ))}
        <label className="check">
          <input type="checkbox" checked={weights.patterns} onChange={(e) => set('patterns', e.target.checked)} />
          <span>Typische Muster bevorzugen <small>(Summe um 150, ausgewogen gerade/ungerade und niedrig/hoch)</small></span>
        </label>
      </div>

      <h3>Warum diese Zahlen?</h3>
      <table>
        <thead><tr><th>Zahl</th><th>Gesamt</th><th>Form</th><th>Überfällig</th><th>Paare</th></tr></thead>
        <tbody>
          {tip.detail.map((d) => (
            <tr key={d.n}>
              <td><span className="ball">{d.n}</span></td>
              <td>{signed(d.overall)}</td><td>{signed(d.recent)}</td><td>{signed(d.overdue)}</td><td>{signed(d.pair)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sub">Werte sind z-Werte (Standardabweichungen vom Erwartungswert). Positiv = spricht für die Zahl.</p>

      <h3>Score aller 49 Zahlen</h3>
      <div className="legend">
        <span><i style={{ background: 'var(--series-1)' }} />Gesamthäufigkeit</span>
        <span><i style={{ background: 'var(--series-3)' }} />Aktuelle Form</span>
        <span><i style={{ background: 'var(--series-2)' }} />Überfälligkeit</span>
        <span>orange Ziffer = im Tipp</span>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={scores} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="n" interval={0} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} tick={<PickTick picks={tip.numbers} />} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: 'var(--grid)', opacity: 0.5 }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return <div className="tip"><b>Zahl {d.n}</b><div>Gesamt {signed(d.overall)}</div><div>Form {signed(d.recent)}</div><div>Überfällig {signed(d.overdue)}</div><div>Σ {signed(d.score)}</div></div>;
          }} />
          <ReferenceLine y={0} stroke="var(--text-3)" />
          <Bar dataKey="overall" stackId="s" fill="var(--series-1)" isAnimationActive={false} />
          <Bar dataKey="recent" stackId="s" fill="var(--series-3)" isAnimationActive={false} />
          <Bar dataKey="overdue" stackId="s" fill="var(--series-2)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>

      <h3>Reality-Check: Hätte das Modell funktioniert?</h3>
      <p className="sub">Test über die letzten {bt.n} Ziehungen: Für jede Ziehung wurde nur mit den Daten davor getippt und dann mit der echten Ziehung verglichen.</p>
      <div className="kpis">
        <div className="kpi"><div className="v">{bt.mean.toFixed(2).replace('.', ',')}</div><div className="l">Ø Treffer pro Tipp (Modell)</div></div>
        <div className="kpi"><div className="v">{bt.expected.toFixed(2).replace('.', ',')}</div><div className="l">Ø Treffer bei reinem Raten</div></div>
        <div className="kpi"><div className="v">{fmtP(btP)}</div><div className="l">p-Wert: Unterschied zufällig?</div></div>
        <div className="kpi"><div className="v">{bt.hits3}×</div><div className="l">mind. 3 Richtige</div></div>
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--series-1)' }} />Modell</span>
        <span><i style={{ background: 'var(--series-3)' }} />zufällige Tipps</span>
        <span>Anteil der Tipps (%) nach Anzahl Richtiger</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={btHist} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} unit=" %" />
          <Tooltip cursor={{ fill: 'var(--grid)', opacity: 0.5 }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return <div className="tip"><b>{d.label} Richtige</b><div>Modell: {fmt1(d.model)} %</div><div>Zufall: {fmt1(d.random)} %</div></div>;
          }} />
          <Bar dataKey="model" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="random" fill="var(--series-3)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <p className="explain">
        <span className={`badge ${btP > 0.05 ? 'ok' : 'warn'}`}>{btP > 0.05 ? '✓ Kein Vorteil' : '⚠ Auffällig'}</span>
        {btP > 0.05
          ? <>Das Modell trifft im Schnitt nicht besser als Raten (z = {fmt1(bt.z)}). Das war zu erwarten: Es gibt in den Daten keine nutzbare Struktur – die Prognose ist reine Unterhaltung.</>
          : <>Der Unterschied ist formal auffällig (z = {fmt1(bt.z)}), aber bei vielen ausprobierten Reglerstellungen ist ein Zufallstreffer wahrscheinlich – ein Vorteil für künftige Ziehungen folgt daraus nicht.</>}
      </p>
    </>
  );
}

export default function Prediction({ draws, predictions, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Prognose">
        <button className="modal-x" onClick={onClose} aria-label="Schließen">✕</button>
        <h2>🔮 Prognose für die nächste Ziehung</h2>
        <p className="disclaimer">
          Nur zum Spaß: Jede Ziehung ist unabhängig, jede Zahl hat immer die gleiche Chance (6/49 ≈ 12,2 %).
          Das Modell mischt Signale aus der Vergangenheit – die gespeicherte Auswertung zeigt, wie gut das wirklich funktioniert.
        </p>

        <SavedPredictions predictions={predictions} />

        <h2 className="lab-title">🧪 Experimentier-Labor</h2>
        <Lab draws={draws} />
      </div>
    </div>
  );
}
