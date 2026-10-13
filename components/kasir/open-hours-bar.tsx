"use client";

import { useTranslation } from "react-i18next";
import { useGame } from "@/lib/game-store";

/** Busy and quiet stretches of the 15 open hours, a marker for now, speed, and an early close. */
const SEGMENTS: Array<{ minutes: number; quiet: boolean }> = [
  { minutes: 240, quiet: false },
  { minutes: 180, quiet: false },
  { minutes: 180, quiet: true },
  { minutes: 180, quiet: false },
  { minutes: 120, quiet: true },
];

export function OpenHoursBar() {
  const { t } = useTranslation();
  const state = useGame((s) => s.state);
  const fast = useGame((s) => s.fast);
  const send = useGame((s) => s.send);
  if (!state) return null;
  const pct = Math.max(0, Math.min(100, ((state.minute - 420) / 900) * 100));
  return (
    <div className="shrink-0 border-b border-line bg-panel px-3 pb-2 pt-1.5">
      <div className="relative flex h-2 gap-px rounded-full" role="img" aria-label={t("hours.label")}>
        {SEGMENTS.map((s, i) => (
          <span
            key={i}
            className={`${s.quiet ? "bg-line" : "bg-accent opacity-60"} first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${s.minutes / 9}%` }}
          />
        ))}
        <span className="absolute -top-0.5 h-3 w-1 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted">
        <span className="font-mono">07</span>
        <span className="flex-1 truncate">
          {t("hours.legend")} · <span className="inline-block h-1.5 w-3 rounded-full bg-accent align-middle opacity-60" /> {t("hours.busy")}{" "}
          <span className="inline-block h-1.5 w-3 rounded-full bg-line align-middle" /> {t("hours.quiet")}
        </span>
        <span className={`rounded-full px-2 py-0.5 font-bold ${fast ? "bg-warn/15 text-warn" : "bg-bg"}`}>
          {fast ? `⏩ ${t("hours.fast")}` : `▶ ${t("hours.normal")}`}
        </span>
        <button onClick={() => send({ type: "closeWarung" })} className="font-bold underline" data-testid="close-warung">
          {t("hours.close")}
        </button>
        <span className="font-mono">22</span>
      </div>
    </div>
  );
}
