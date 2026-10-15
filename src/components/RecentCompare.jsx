import React from 'react';
import { Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt1, fmtDate, fmtP } from '../stats.js';

const AXIS = { fontSize: 11, fill: 'var(--text-2)' };
const grid = <CartesianGrid stroke="var(--grid)" vertical={false} />;
const pct = (x) => `${fmt1(x)} %`;

function Tip({ active, payload, render }) {
  if (!active || !payload?.length) return null;
  return <div className="tip">{render(payload[0].payload)}</div>;
}

function Legend({ days }) {
  return (
    <div className="legend">
      <span><i style={{ background: 'var(--series-1)' }} />letzte {days} Tage</span>
      <span><i style={{ background: 'var(--series-3)' }} />davor</span>
    </div>
  );
}

function GroupedBars({ data, days, unit, title }) {
  return (
    <>
      <Legend days={days} />
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2}>
          {grid}
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} unit={unit} />
          <Tooltip cursor={{ fill: 'var(--grid)', opacity: 0.5 }} content={<Tip render={(d) => (
            <><b>{title}{d.label}</b><div>zuletzt: {pct(d.recent)}</div><div>davor: {pct(d.earlier)}</div></>
          )} />} />
          <Bar dataKey="recent" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="earlier" fill="var(--series-3)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

export default function RecentCompare({ Card, c }) {
  const diffOk = c.chiP > 0.05;
  const sig = c.metrics.filter((m) => m.p < 0.05);
  const top = c.movers.slice(0, 5);
  const up = [...c.perNumber].sort((a, b) => b.diff - a.diff).slice(0, 5);
  const down = [...c.perNumber].sort((a, b) => a.diff - b.diff).slice(0, 5);

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="v">{c.nR}</div><div className="l">Ziehungen letzte {c.days} Tage<br />(ab {fmtDate(c.firstR)})</div></div>
        <div className="kpi"><div className="v">{c.nE}</div><div className="l">Ziehungen davor<br />(bis {fmtDate(c.lastE)})</div></div>
        <div className="kpi"><div className="v">{fmtP(c.chiP)}</div><div className="l">p-Wert: Verteilung unterscheidet sich? (χ²)</div></div>
        <div className="kpi"><div className="v">{sig.length} / {c.metrics.length}</div><div className="l">Kennzahlen mit signifikantem Unterschied</div></div>
      </div>

      <div className="grid">
        <Card wide title={`Veränderung je Zahl: letzte ${c.days} Tage vs. davor`}
          sub="Differenz des Anteils der Ziehungen, in denen die Zahl vorkam (Prozentpunkte). Orange = zuletzt häufiger, blau = zuletzt seltener"
          ok={diffOk}
          explain={<>Homogenitäts-χ² = {fmt1(c.chi2)}, <b>p = {fmtP(c.chiP)}</b>. {diffOk
            ? `Die jüngsten ${c.nR} Ziehungen unterscheiden sich nicht systematisch vom Rest. Bei nur ${c.nR} Ziehungen schwanken einzelne Zahlen naturgemäß stark.`
            : 'Die Verteilung der letzten Monate weicht signifikant vom Rest ab.'}</>}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={c.perNumber} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              {grid}
              <XAxis dataKey="n" tick={AXIS} interval={1} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} unit=" pp" />
              <Tooltip cursor={{ fill: 'var(--grid)', opacity: 0.5 }} content={<Tip render={(d) => (
                <><b>Zahl {d.n}</b><div>zuletzt: {pct(d.pctR)} ({d.recent}×)</div><div>davor: {pct(d.pctE)} ({d.earlier}×)</div><div>Differenz: {d.diff > 0 ? '+' : ''}{fmt1(d.diff)} pp (z = {fmt1(d.z)})</div></>
              )} />} />
              <ReferenceLine y={0} stroke="var(--text-3)" />
              <Bar dataKey="diff" radius={[3, 3, 3, 3]}>
                {c.perNumber.map((d) => <Cell key={d.n} fill={d.diff >= 0 ? 'var(--div-pos)' : 'var(--div-neg)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Größte Veränderungen" sub="Zahlen mit der stärksten Abweichung zwischen den Zeiträumen (Anteil der Ziehungen mit dieser Zahl)"
          explain={<>Bei 49 Zahlen fallen immer einige auf: z-Werte über ±2 sind unter 49 Zahlen erwartbar. Erst ab etwa ±3,3 (Bonferroni-Korrektur für 49 Tests) wäre eine Zahl wirklich auffällig.
            {Math.abs(top[0].z) > 3.3 && <> <b>Hier überschreitet Zahl {top[0].n} diese Schwelle</b> – bei nur {c.nR} Ziehungen und den vielen Vergleichen bleibt das aber ein Hinweis, kein Beweis.</>}</>}>
          <table>
            <thead><tr><th>Zahl</th><th>letzte {c.days} T.</th><th>davor</th><th>z</th></tr></thead>
            <tbody>
              {top.map((m) => (
                <tr key={m.n}><td><span className="ball">{m.n}</span></td><td>{pct(m.pctR)}</td><td>{pct(m.pctE)}</td><td>{m.z > 0 ? '+' : ''}{fmt1(m.z)}</td></tr>
              ))}
            </tbody>
          </table>
          <table style={{ marginTop: 14 }}>
            <thead><tr><th>Zuletzt häufiger</th><th>Diff.</th></tr></thead>
            <tbody>{up.map((m) => <tr key={m.n}><td><span className="ball">{m.n}</span></td><td>+{fmt1(m.diff)} pp</td></tr>)}</tbody>
          </table>
          <table style={{ marginTop: 14 }}>
            <thead><tr><th>Zuletzt seltener</th><th>Diff.</th></tr></thead>
            <tbody>{down.map((m) => <tr key={m.n}><td><span className="ball">{m.n}</span></td><td>{fmt1(m.diff)} pp</td></tr>)}</tbody>
          </table>
        </Card>

        <Card title="Kennzahlen pro Ziehung" sub="Durchschnittswerte im Vergleich (Welch-z-Test)"
          ok={sig.length === 0}
          explain={<>Erst bei p &lt; 0,05 gilt ein Unterschied als signifikant – bei {c.metrics.length} Tests ist ein einzelner „Treffer“ rein zufällig nicht auszuschließen.</>}>
          <table>
            <thead><tr><th>Kennzahl</th><th>zuletzt</th><th>davor</th><th>p</th></tr></thead>
            <tbody>
              {c.metrics.map((m) => (
                <tr key={m.key}><td>{m.label}</td><td>{fmt1(m.recent)}</td><td>{fmt1(m.earlier)}</td><td>{m.p < 0.05 ? '⚠ ' : ''}{fmtP(m.p)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Zahlenbereiche im Vergleich" sub="Anteil der gezogenen Zahlen je Zehnergruppe (%)"
          explain={<>Ein „Wandern“ in höhere oder niedrigere Bereiche ist nur erkennbar, wenn die Balkenpaare systematisch auseinanderlaufen.</>}>
          <GroupedBars data={c.decades} days={c.days} unit=" %" title="" />
        </Card>

        <Card title="Summenverteilung im Vergleich" sub="Anteil der Ziehungen je Summenklasse (%)"
          explain={<>Beide Zeiträume sollten dieselbe Glockenform um 150 zeigen – im kürzeren Zeitraum ist die Zufallsschwankung größer.</>}>
          <GroupedBars data={c.sumDist} days={c.days} unit=" %" title="Summe " />
        </Card>
      </div>
    </>
  );
}
