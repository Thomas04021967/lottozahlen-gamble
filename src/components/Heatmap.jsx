import React, { useState } from 'react';
import { N } from '../stats.js';

const CELL = 14;
const PAD = 24;

// Divergierende Skala: blau (seltener als erwartet) – neutral – orange (häufiger)
function color(z) {
  const t = Math.min(1, Math.abs(z) / 3.5);
  const base = z >= 0 ? 'var(--div-pos)' : 'var(--div-neg)';
  return `color-mix(in oklab, ${base} ${Math.round(t * 100)}%, var(--border))`;
}

export default function Heatmap({ pairList, pair }) {
  const [hover, setHover] = useState(null);
  const size = PAD + N * CELL;
  const zMap = {};
  pairList.forEach((p) => { zMap[`${p.a}-${p.b}`] = p.z; });

  const cells = [];
  for (let a = 1; a <= N; a++) {
    for (let b = 1; b <= N; b++) {
      if (a === b) continue;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const z = zMap[`${lo}-${hi}`];
      cells.push(
        <rect
          key={`${a}-${b}`}
          x={PAD + (b - 1) * CELL}
          y={PAD + (a - 1) * CELL}
          width={CELL - 1}
          height={CELL - 1}
          rx={2}
          fill={color(z)}
          onMouseEnter={() => setHover({ a: lo, b: hi, z, count: pair[lo][hi] })}
          onMouseLeave={() => setHover(null)}
        />
      );
    }
  }
  const ticks = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 49];

  return (
    <div>
      <div style={{ minHeight: 22, fontSize: 13, marginBottom: 6 }}>
        {hover
          ? <><b>{hover.a} &amp; {hover.b}</b>: {hover.count}× gemeinsam gezogen · z = {hover.z.toFixed(2).replace('.', ',')}</>
          : <span style={{ color: 'var(--text-3)' }}>Mit der Maus über ein Feld fahren für Details</span>}
      </div>
      <div className="heat-wrap">
        <svg width={size} height={size} role="img" aria-label="Heatmap der Zahlenpaare">
          {ticks.map((t) => (
            <g key={t} fontSize="9" fill="var(--text-3)">
              <text x={PAD + (t - 1) * CELL + CELL / 2} y={14} textAnchor="middle">{t}</text>
              <text x={PAD - 6} y={PAD + (t - 1) * CELL + CELL - 3} textAnchor="end">{t}</text>
            </g>
          ))}
          {cells}
        </svg>
      </div>
      <div className="heat-scale">
        <span>seltener als erwartet</span><span className="bar" /><span>häufiger als erwartet</span>
      </div>
    </div>
  );
}
