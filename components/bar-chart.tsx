"use client";

import { useState } from "react";

interface Props {
  values: number[];
  labels: string[];
  ariaLabel: string;
  format: (n: number) => string;
  /** Labels the axis ticks, e.g. 50.000 as "50rb". */
  tick: (n: number) => string;
}

const W = 360;
const H = 140;
const L = 38;
const R = 8;
const T = 10;
const B = 22;

/** Single-series bars: one hue, a quiet grid, and a hover or tap tooltip with the exact value. */
export function BarChart({ values, labels, ariaLabel, format, tick }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const raw = Math.max(...values, 1);
  const step = Math.pow(10, Math.floor(Math.log10(raw))) / 2;
  const max = Math.ceil(raw / step) * step;
  const slot = (W - L - R) / values.length;
  const bw = slot * 0.62;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const peak = values.indexOf(Math.max(...values));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(values.length - 1, Math.floor((px - L) / slot))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 6} y={y(max * f) + 3} textAnchor="end" className="fill-muted font-mono" fontSize={9}>
              {tick(max * f)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const cx = L + slot * (i + 0.5);
          const top = y(v);
          return (
            <g key={i}>
              <rect
                x={cx - bw / 2}
                y={top}
                width={bw}
                height={Math.max(y(0) - top, v > 0 ? 1 : 0)}
                rx={3}
                fill="var(--accent)"
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
              <text x={cx} y={H - 6} textAnchor="middle" className="fill-muted font-mono" fontSize={9}>
                {labels[i]}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 font-mono text-[11px] text-paper"
          style={{ left: `${((L + slot * (hover + 0.5)) / W) * 100}%` }}
        >
          {labels[hover]} · {format(values[hover])}
        </div>
      )}
      <span className="sr-only">{`${labels[peak]}: ${format(values[peak])}`}</span>
    </div>
  );
}
