import React, { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import UpdateBar from './components/UpdateBar.jsx';
import { useLottoData } from './useLottoData.js';
import RecentCompare from './components/RecentCompare.jsx';
import { analyze, compareRecent, chiSquarePValue, fmt1, fmtDate, fmtP } from './stats.js';
import Prediction from './components/Prediction.jsx';
import Heatmap from './components/Heatmap.jsx';

const AXIS = { fontSize: 11, fill: 'var(--text-2)' };
const GRID = <CartesianGrid stroke="var(--grid)" vertical={false} />;

function Card({ title, sub, wide, children, explain, ok }) {
  return (
    <section className={`card${wide ? ' wide' : ''}`}>
      <h3>{title}</h3>
      {sub && <p className="sub">{sub}</p>}
      {children}
      {explain && (
        <p className="explain">
          {ok !== undefined && (
            <span className={`badge ${ok ? 'ok' : 'warn'}`}>{ok ? '✓ Zufallstypisch' : '⚠ Auffällig'}</span>
          )}
          {explain}
        </p>
      )}
    </section>
  );
}

function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}><i className={i.line ? 'line' : ''} style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  );
}

function Tip({ active, payload, label, render }) {
  if (!active || !payload?.length) return null;
  return <div className="tip"><b>{label ?? ''}</b>{render ? render(payload[0].payload) : payload.map((p) => <div key={p.dataKey}>{p.name}: {p.value}</div>)}</div>;
}

// Balken (beobachtet) + Linie/Marker (erwartet)
function ObsExp({ data, height = 240, xInterval = 0 }) {
  return (
    <>
      <Legend items={[{ label: 'beobachtet', color: 'var(--series-1)' }, { label: 'erwartet bei reinem Zufall', color: 'var(--series-2)', line: true }]} />
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          {GRID}
          <XAxis dataKey="label" tick={AXIS} interval={xInterval} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip content={<Tip render={(d) => <><div>beobachtet: {d.count}</div><div>erwartet: {fmt1(d.expected)}</div></>} />} cursor={{ fill: 'var(--grid)', opacity: 0.5 }} />
          <Bar dataKey="count" name="beobachtet" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
          <Line dataKey="expected" name="erwartet" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 4, fill: 'var(--series-2)', stroke: 'var(--surface)', strokeWidth: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

// Chi²-Anpassungstest für Kategorien mit beobachtet/erwartet
function chiTest(rows) {
  const valid = rows.filter((r) => r.expected >= 1);
  return valid.reduce((s, r) => s + (r.count - r.expected) ** 2 / r.expected, 0);
}

function Dashboard({ draws, status, predictions, check }) {
  const [showPredict, setShowPredict] = useState(false);
  const s = useMemo(() => analyze(draws), [draws]);
  const cmp = useMemo(() => compareRecent(draws, 180), [draws]);

  const byCount = [...s.freq].sort((a, b) => b.count - a.count);
  const hot = byCount.slice(0, 5);
  const cold = byCount.slice(-5).reverse();
  const overdue = [...s.freq].sort((a, b) => b.since - a.since).slice(0, 8);
  const maxZ = Math.max(...s.freq.map((f) => Math.abs(f.z)));
  const freqOk = s.chiP > 0.05;
  const sumDev = s.sumObsMean - s.sumMean;
  const acfOk = s.acf.every((a) => Math.abs(a.r) < s.acfLimit * 1.5);
  const pairOk = s.maxAbsZPair < s.bonferroniZ;
  const yearlyBad = s.yearly.filter((y) => y.p < 0.05).length;

  return (
    <div className="page">
      <header>
        <div className="header-row">
          <div>
            <h1>🎱 Lotto-Statistik 6 aus 49</h1>
            <p>{s.D} Ziehungen vom {fmtDate(s.first)} bis {fmtDate(s.last)} – Verteilungen, Korrelationen und Zufallstests auf einen Blick</p>
          </div>
          <button className="predict-btn" onClick={() => setShowPredict(true)}>🔮 Prognose nächste Ziehung</button>
        </div>
        <UpdateBar status={status} onCheck={check} />
      </header>

      <nav>
        <a href="#fazit">Fazit</a>
        <a href="#haeufigkeit">Häufigkeit</a>
        <a href="#muster">Muster</a>
        <a href="#zusammenhang">Zusammenhänge</a>
        <a href="#zeit">Zeitverlauf</a>
        <a href="#vergleich">Letzte 180 Tage</a>
      </nav>

      <div className="kpis">
        <div className="kpi"><div className="v">{s.D}</div><div className="l">Ziehungen</div></div>
        <div className="kpi"><div className="v">{fmt1(s.expected)}</div><div className="l">erwartete Treffer je Zahl</div></div>
        <div className="kpi"><div className="v">{fmtP(s.chiP)}</div><div className="l">p-Wert Gleichverteilung (χ²)</div></div>
        <div className="kpi"><div className="v">{s.sigPairs} / {Math.round(s.expectedSigPairs)}</div><div className="l">auffällige Paare / bei Zufall erwartet</div></div>
      </div>

      <div className="verdict" id="fazit">
        <h2>Fazit in einfachen Worten</h2>
        <p>
          <span className={`badge ${freqOk ? 'ok' : 'warn'}`}>{freqOk ? '✓' : '⚠'}</span>
          <b>Häufigkeiten:</b> {freqOk
            ? `Alle 49 Zahlen kommen etwa gleich oft vor. Die Unterschiede (${hot[0].n} am häufigsten mit ${hot[0].count}×, ${cold[0].n} am seltensten mit ${cold[0].count}×) liegen im normalen Zufallsbereich.`
            : 'Die Häufigkeiten weichen statistisch signifikant von einer Gleichverteilung ab.'}
        </p>
        <p>
          <span className={`badge ${pairOk ? 'ok' : 'warn'}`}>{pairOk ? '✓' : '⚠'}</span>
          <b>Zusammenhänge:</b> {pairOk
            ? `Kein Zahlenpaar tritt nach Korrektur für ${s.nPairs} Vergleiche auffällig oft oder selten zusammen auf. Es gibt keine „Lieblingspaare“.`
            : 'Mindestens ein Zahlenpaar ist auch nach Mehrfachtest-Korrektur auffällig.'}
        </p>
        <p>
          <span className={`badge ${acfOk ? 'ok' : 'warn'}`}>{acfOk ? '✓' : '⚠'}</span>
          <b>Gedächtnis:</b> {acfOk
            ? 'Eine Ziehung hängt nicht von den vorherigen ab – es gibt keine erkennbare zeitliche Struktur.'
            : 'Die Ziehungssummen zeigen eine zeitliche Abhängigkeit.'}
        </p>
        <p style={{ fontSize: 13 }}>Die Statistik beschreibt die Vergangenheit. Da jede Ziehung unabhängig ist, lassen sich daraus keine Gewinnzahlen vorhersagen.</p>
      </div>

      {/* ---------------- Häufigkeit ---------------- */}
      <h2 className="section" id="haeufigkeit">1 · Wie oft wurde welche Zahl gezogen?</h2>
      <div className="grid">
        <Card wide title="Häufigkeit jeder Zahl" sub="Anzahl Ziehungen, in denen die Zahl vorkam; gestrichelte Linie = Erwartungswert"
          ok={freqOk}
          explain={<>χ² = {fmt1(s.chi2)} bei 48 Freiheitsgraden, <b>p = {fmtP(s.chiP)}</b>. Ein p-Wert über 0,05 bedeutet: die Abweichungen sind mit reinem Zufall vereinbar. Die größte Einzelabweichung beträgt {fmt1(maxZ)} Standardabweichungen.</>}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={s.freq} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="n" tick={AXIS} interval={1} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, 'auto']} />
              <Tooltip cursor={{ fill: 'var(--grid)', opacity: 0.5 }} content={<Tip label={null} render={(d) => <><div><b>Zahl {d.n}</b></div><div>{d.count}× gezogen</div><div>Abweichung: {d.z >= 0 ? '+' : ''}{fmt1(d.z)} σ</div></>} />} />
              <ReferenceLine y={s.expected} stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4" label={{ value: `Erwartung ${fmt1(s.expected)}`, position: 'insideTopRight', fill: 'var(--text-2)', fontSize: 11 }} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {s.freq.map((f) => <Cell key={f.n} fill="var(--series-1)" fillOpacity={Math.abs(f.z) > 1.5 ? 1 : 0.65} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Am häufigsten & am seltensten" sub="die jeweils 5 Extreme">
          <table>
            <thead><tr><th>Heiße Zahlen</th><th>Anzahl</th><th>Abw.</th></tr></thead>
            <tbody>{hot.map((f) => <tr key={f.n}><td><span className="ball">{f.n}</span></td><td>{f.count}×</td><td>{f.z >= 0 ? '+' : ''}{fmt1(f.z)} σ</td></tr>)}</tbody>
          </table>
          <table style={{ marginTop: 14 }}>
            <thead><tr><th>Kalte Zahlen</th><th>Anzahl</th><th>Abw.</th></tr></thead>
            <tbody>{cold.map((f) => <tr key={f.n}><td><span className="ball">{f.n}</span></td><td>{f.count}×</td><td>{fmt1(f.z)} σ</td></tr>)}</tbody>
          </table>
          <p className="explain"><b>σ</b> = Standardabweichungen vom Erwartungswert. Werte unter ±2 sind bei 49 Zahlen völlig normal.</p>
        </Card>

        <Card title="Überfällige Zahlen" sub={`Ziehungen seit dem letzten Auftreten (Durchschnitt ≈ ${fmt1(s.expectedGap)})`}
          explain={<><b>Gambler's Fallacy:</b> Eine lange nicht gezogene Zahl ist nicht „fällig“ – die Lottokugeln haben kein Gedächtnis.</>}>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={overdue.map((o) => ({ ...o, label: String(o.n) }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'var(--grid)', opacity: 0.5 }} content={<Tip label={null} render={(d) => <><div><b>Zahl {d.n}</b></div><div>seit {d.since} Ziehungen nicht gezogen</div></>} />} />
              <ReferenceLine y={s.expectedGap} stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4" />
              <Bar dataKey="since" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ---------------- Muster ---------------- */}
      <h2 className="section" id="muster">2 · Welche Muster haben die Ziehungen?</h2>
      <div className="grid">
        <Card title="Summe der 6 Zahlen" sub={`Ø beobachtet ${fmt1(s.sumObsMean)} · theoretisch ${s.sumMean}`}
          ok={Math.abs(sumDev) < 3 * s.sumSd / Math.sqrt(s.D)}
          explain={<>Die Summen bilden die typische Glockenkurve (Normalverteilung) um 150. Extrem niedrige oder hohe Summen sind selten, weil es dafür wenige Kombinationen gibt.</>}>
          <ObsExp data={s.sumBins} xInterval={1} />
        </Card>

        <Card title="Gerade / Ungerade" sub="Wie viele der 6 Zahlen sind gerade?"
          ok={chiSquarePValue(chiTest(s.evenOdd), 6) > 0.01}
          explain={<>Am häufigsten sind Mischungen wie 3 gerade / 3 ungerade. Reine 6er-Gruppen kommen kaum vor – genau wie berechnet.</>}>
          <ObsExp data={s.evenOdd} />
        </Card>

        <Card title="Niedrig (1–24) / Hoch (25–49)" sub="Wie viele Zahlen liegen in der unteren Hälfte?"
          explain={<>Auch hier gilt: ausgewogene Verteilungen sind am wahrscheinlichsten, und die beobachteten Werte folgen der Erwartung.</>}>
          <ObsExp data={s.lowHigh} />
        </Card>

        <Card title="Zahlenbereiche (Zehnergruppen)" sub="Gezogene Zahlen je Bereich"
          explain={<>Die Gruppe 1–9 ist kleiner (9 statt 10 Zahlen), daher ist ihr Erwartungswert niedriger.</>}>
          <ObsExp data={s.decades} />
        </Card>

        <Card title="Aufeinanderfolgende Zahlen" sub={`Ziehungen mit mindestens einem Paar wie 17–18: ${(s.consecShare * 100).toFixed(1).replace('.', ',')} % (erwartet ${(s.consecExpShare * 100).toFixed(1).replace('.', ',')} %)`}
          ok={Math.abs(s.consecShare - s.consecExpShare) < 0.06}
          explain={<>Viele halten „Nachbarzahlen“ für unwahrscheinlich – tatsächlich kommen sie in etwa jeder zweiten Ziehung vor.</>}>
          <ObsExp data={s.consecutive} />
        </Card>

        <Card title="Wiederholung aus der Vorziehung" sub="Wie viele Zahlen der letzten Ziehung kommen erneut vor?"
          explain={<>Wiederholungen sind normal und passen zur hypergeometrischen Erwartung. Die Vorziehung beeinflusst die nächste nicht.</>}>
          <ObsExp data={s.overlap} />
        </Card>

        <Card wide title="Abstände zwischen zwei Ziehungen derselben Zahl" sub="Wie viele Ziehungen liegen zwischen zwei Treffern der gleichen Zahl?"
          explain={<>Die Abstände folgen einer geometrischen Verteilung (Ø {fmt1(s.gapMean)}). Kurze Abstände sind am häufigsten – kein Hinweis auf „Zyklen“.</>}>
          <ObsExp data={s.gapDist} height={260} />
        </Card>
      </div>

      {/* ---------------- Zusammenhänge ---------------- */}
      <h2 className="section" id="zusammenhang">3 · Gibt es Zusammenhänge zwischen Zahlen?</h2>
      <div className="grid">
        <Card wide title="Paar-Heatmap: Welche Zahlen kommen zusammen vor?"
          sub="Jedes Feld = ein Zahlenpaar; Farbe = Abweichung der gemeinsamen Ziehungen vom Erwartungswert (z-Wert)"
          ok={pairOk}
          explain={<>Von {s.nPairs} Paaren sind {s.sigPairs} auf 5-%-Niveau auffällig – bei reinem Zufall erwartet man ca. {Math.round(s.expectedSigPairs)}. Der größte z-Wert ist {fmt1(s.maxAbsZPair)}, die Schwelle nach Bonferroni-Korrektur liegt bei {fmt1(s.bonferroniZ)}. Die bunten Felder sind daher Zufallsrauschen.</>}>
          <Heatmap pairList={s.pairList} pair={s.pair} />
        </Card>

        <Card title="Häufigste Zahlenpaare" sub="am häufigsten gemeinsam gezogen"
          explain={<>Erwartung je Paar: {fmt1(s.D * 30 / (49 * 48))}× – auch die Spitzenreiter liegen nur knapp darüber.</>}>
          <table>
            <thead><tr><th>Paar</th><th>gemeinsam</th><th>z-Wert</th></tr></thead>
            <tbody>
              {s.topPairs.map((p) => (
                <tr key={`${p.a}-${p.b}`}><td><span className="ball">{p.a}</span><span className="ball">{p.b}</span></td><td>{p.count}×</td><td>{fmt1(p.z)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Autokorrelation der Ziehungssumme" sub="Korrelation einer Ziehung mit der n-ten Ziehung davor"
          ok={acfOk}
          explain={<>Alle Balken liegen im Bereich von etwa ±{s.acfLimit.toFixed(2).replace('.', ',')} (gestrichelt) – es gibt keine Abhängigkeit zwischen aufeinanderfolgenden Ziehungen.</>}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={s.acf} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="lag" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} label={{ value: 'Abstand (Ziehungen)', position: 'insideBottom', offset: -2, fill: 'var(--text-2)', fontSize: 11 }} height={36} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[-0.2, 0.2]} />
              <Tooltip cursor={{ fill: 'var(--grid)', opacity: 0.5 }} content={<Tip label={null} render={(d) => <><div><b>Abstand {d.lag}</b></div><div>r = {d.r.toFixed(3).replace('.', ',')}</div></>} />} />
              <ReferenceLine y={s.acfLimit} stroke="var(--series-2)" strokeDasharray="5 4" />
              <ReferenceLine y={-s.acfLimit} stroke="var(--series-2)" strokeDasharray="5 4" />
              <ReferenceLine y={0} stroke="var(--text-3)" />
              <Bar dataKey="r" fill="var(--series-1)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ---------------- Zeit ---------------- */}
      <h2 className="section" id="zeit">4 · Verändert sich etwas über die Zeit?</h2>
      <div className="grid">
        <Card wide title="Ziehungssumme im Zeitverlauf" sub="graue Punkte = einzelne Ziehungen, Linie = gleitender Durchschnitt (26 Ziehungen ≈ ½ Jahr)"
          explain={<>Der Durchschnitt schwankt um die theoretische Summe 150 (gestrichelt) – ohne erkennbaren Trend.</>}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={s.sumTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="i" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} interval={79} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[40, 270]} />
              <Tooltip content={<Tip label={null} render={(d) => <><div><b>{d.date}</b></div><div>Summe: {d.sum}</div>{d.avg && <div>Ø 26 Ziehungen: {fmt1(d.avg)}</div>}</>} />} />
              <ReferenceLine y={s.sumMean} stroke="var(--series-2)" strokeDasharray="5 4" />
              <Line dataKey="sum" stroke="var(--text-3)" strokeOpacity={0.35} strokeWidth={1} dot={false} isAnimationActive={false} />
              <Line dataKey="avg" stroke="var(--series-1)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Gleichverteilung je Jahr (χ²)" sub="Je Jahr Test auf Gleichverteilung – gestrichelt: kritischer Wert (5 %)"
          ok={yearlyBad <= 1}
          explain={<>{yearlyBad === 0 ? 'In keinem Jahr' : `In ${yearlyBad} von ${s.yearly.length} Jahren`} ist die Verteilung auffällig. Bei 5-%-Niveau ist gelegentlich ein Ausreißer zu erwarten. (Das laufende Jahr hat weniger Ziehungen.)</>}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={s.yearly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'var(--grid)', opacity: 0.5 }} content={<Tip label={null} render={(d) => <><div><b>{d.year}</b> ({d.draws} Ziehungen)</div><div>χ² = {d.chi2}</div><div>p = {fmtP(d.p)}</div></>} />} />
              <ReferenceLine y={65.17} stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4" />
              <Bar dataKey="chi2" radius={[4, 4, 0, 0]}>
                {s.yearly.map((y) => <Cell key={y.year} fill={y.p < 0.05 ? 'var(--series-2)' : 'var(--series-1)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Ziehungstage" sub="Anzahl Ziehungen je Wochentag" explain={<>Gezogen wird mittwochs und samstags.</>}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={s.weekdays} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'var(--grid)', opacity: 0.5 }} content={<Tip />} />
              <Bar dataKey="count" name="Ziehungen" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <h2 className="section" id="vergleich">5 · Letzte 180 Tage im Vergleich zu davor</h2>
      <RecentCompare Card={Card} c={cmp} />

      {showPredict && <Prediction draws={draws} predictions={predictions} onClose={() => setShowPredict(false)} />}

      <footer>
        Methoden: χ²-Anpassungstest, z-Werte (Binomial-/Hypergeometrie-Näherung), Bonferroni-Korrektur, Autokorrelation, geometrische Abstandsverteilung. Datenquelle: lottozahlen.csv.
      </footer>
    </div>
  );
}

export default function App() {
  const { draws, loadError, status, predictions, check } = useLottoData();
  if (!draws) {
    return (
      <div className="page">
        <h1>🎱 Lotto-Statistik 6 aus 49</h1>
        <p>{loadError
          ? 'Die Datenbank ist nur über den Server erreichbar. Bitte mit „npm run dev“ oder „npm run preview“ starten.'
          : 'Lade Daten …'}</p>
        {loadError && loadError !== 'offline' && <p>Fehler: {loadError}</p>}
      </div>
    );
  }
  return <Dashboard draws={draws} status={status} predictions={predictions} check={check} />;
}
