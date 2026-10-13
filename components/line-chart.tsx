"use client";

import { useState } from "react";

interface Props {
  values: number[];
  labels: string[];
  ariaLabel: string;
  format: (n: number) => string;
  tick: (n: number) => string;
  /** Vertical markers, for example the day a price event began. */
  marks?: Array<{ index: number; label: string }>;
}

const W = 360;
const H = 170;
const L = 44;
const R = 16;
const T = 12;
const B = 22;

/** One series: a thin accent line over a faint area, a quiet grid, the latest value marked, and a hover tooltip. */
export function LineChart({ values, labels, ariaLabel, format, tick, marks = [] }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const lo0 = Math.min(...values);
  const hi0 = Math.max(...values);
  const pad = (hi0 - lo0) * 0.15 || hi0 * 0.05 || 1;
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const x = (i: number) => L + ((W - L - R) * i) / Math.max(1, values.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const last = values.length - 1;
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-pan-y"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(last, Math.round(((px - L) / (W - L - R)) * last))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 6} y={y(v) + 3} textAnchor="end" className="fill-muted font-mono" fontSize={9}>
              {tick(v)}
            </text>
          </g>
        ))}
        {[0, Math.floor(last / 2), last].map((i, k) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"} className="fill-muted font-mono" fontSize={9}>
            {labels[i]}
          </text>
        ))}
        {marks.map((m) => (
          <g key={m.index}>
            <line x1={x(m.index)} x2={x(m.index)} y1={T} y2={H - B} stroke="var(--warn)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={x(m.index) - 4} y={T + 9} textAnchor="end" fontSize={9} className="font-mono" fill="var(--warn)">
              {m.label}
            </text>
          </g>
        ))}
        <path d={`M${points.join("L")}L${x(last)},${H - B}L${x(0)},${H - B}Z`} fill="var(--accent)" opacity={0.12} />
        <path d={`M${points.join("L")}`} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last)} cy={y(values[last])} r={4} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(values[hover])} r={4} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 font-mono text-[11px] text-paper"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          {labels[hover]} · {format(values[hover])}
        </div>
      )}
    </div>
  );
}
