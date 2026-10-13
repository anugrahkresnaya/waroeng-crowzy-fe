"use client";

import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { formatClock, total } from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";

/** Clock, day, reputation and money, shared by the warung screens. */
export function TopBar({ showPause = false }: { showPause?: boolean }) {
  const { t } = useTranslation();
  const state = useGame((s) => s.state);
  const paused = useGame((s) => s.paused);
  const setPaused = useGame((s) => s.setPaused);
  if (!state) return null;
  const weekday = state.day % 7;
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="w-7">
          <Art id="ikon-jam" />
        </div>
        <div className="leading-none">
          <div className="font-mono text-xl font-medium tabular-nums" data-testid="clock">
            {formatClock(state.minute)}
          </div>
          <div className="mt-1 whitespace-nowrap text-[11px] text-muted">
            {t(`weekday.${weekday}`)} · {t("day", { n: state.day + 1 })}
          </div>
        </div>
      </div>
      {showPause && (
        <button
          onClick={() => setPaused(!paused)}
          data-testid="pause"
          className={`ml-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${paused ? "border-accent bg-accent text-accent-fg" : "border-line"}`}
        >
          {paused ? t("resume") : t("pause")}
        </button>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex items-center gap-1 rounded-lg bg-bg px-2 py-1 text-xs" title={t("reputation")}>
          <div className="w-4">
            <Art id="ikon-bintang" />
          </div>
          <b className="font-mono tabular-nums">{Math.round(state.reputation)}</b>
        </div>
        <div className="rounded-lg bg-bg px-2 py-1 text-[11px] leading-tight">
          <span className="text-muted">{t("drawer")}</span>{" "}
          <b className="font-mono tabular-nums" data-testid="drawer">{rp(total(state.drawer))}</b>
          <br />
          <span className="text-muted">{t("bank")}</span> <b className="font-mono tabular-nums">{rp(state.bank)}</b>
        </div>
      </div>
    </header>
  );
}
