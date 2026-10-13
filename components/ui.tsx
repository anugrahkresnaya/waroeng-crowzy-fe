import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "soft" | "bad";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg",
  ghost: "border border-line bg-panel",
  soft: "border border-line bg-bg",
  bad: "bg-bad text-white",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Chip({
  on,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button
      {...props}
      aria-pressed={on}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${
        on ? "border-accent bg-accent text-accent-fg" : "border-line bg-panel"
      } ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-panel ${className}`}>{children}</div>;
}

type Tone = "good" | "bad" | "warn" | "mute";
const TONES: Record<Tone, string> = {
  good: "bg-good/15 text-good",
  bad: "bg-bad/15 text-bad",
  warn: "bg-warn/15 text-warn",
  mute: "bg-bg text-muted",
};

export function Pill({ tone = "mute", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TONES[tone]}`}>{children}</span>;
}

export function Meter({ label, pct, tone = "bg-accent" }: { label: string; pct: number; tone?: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <b className="font-mono tabular-nums">{Math.round(v)}%</b>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg" role="progressbar" aria-label={label} aria-valuenow={Math.round(v)}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
