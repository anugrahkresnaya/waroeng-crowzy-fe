/** A tiny trend line for a list row: no axes, just the shape and where it ends. */
export function Spark({ values, rising }: { values: number[]; rising: boolean }) {
  const w = 64;
  const h = 24;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6)]);
  const color = rising ? "var(--bad)" : "var(--accent)";
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <path d={`M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}`} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.4} fill={color} />
    </svg>
  );
}
