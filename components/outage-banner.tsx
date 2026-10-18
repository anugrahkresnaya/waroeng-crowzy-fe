"use client";

import { useTranslation } from "react-i18next";
import { content, formatClock, outageEnd, powerOff, type CommandError } from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";

const BTN = "rounded-full border-2 border-ink bg-panel px-2.5 py-0.5 text-[11px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40";

/** A strip at the top of every game screen while a power cut is coming or happening, with what the player can do about it. */
export function OutageBanner() {
  const { t } = useTranslation();
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  if (!state?.outage) return null;
  const o = state.outage;
  const c = content.balance.outage;
  const today = o.day === state.day && state.minute < outageEnd(o);
  const tomorrow = o.known && o.day === state.day + 1;
  if (!today && !tomorrow) return null;

  const vars = { from: formatClock(o.from), until: formatClock(outageEnd(o)) };
  const off = powerOff(state);
  const errandWhy = (): CommandError | null => {
    if (state.phase === "open") return state.busyUntil > 0 ? "busy" : null;
    if (state.phase === "idle") return state.preOpenUsed + c.errandMinutes > content.balance.preOpenMinutes ? "no_time" : null;
    return ["ended", "night", "bed"].includes(state.phase) ? null : "wrong_phase";
  };
  const why = (price: number): CommandError | null => errandWhy() ?? (state.bank < price ? "insufficient_funds" : null);
  const iceWhy = why(c.ice.price);
  const lanternWhy = why(c.lantern.price);
  const fridgeRisk = o.hours > c.fridgeHoldHours + (o.ice ? c.ice.holdHours : 0);

  return (
    <div className="shrink-0 border-b-2 border-bad/60 bg-bad/10 px-3 py-1.5 text-xs" role="status" data-testid="outage-banner" data-power={off ? "off" : "on"}>
      <b className="text-bad">{t(today ? (off ? "outage.now" : "outage.today") : "outage.tomorrow", vars)}</b>
      {today && !o.ice && fridgeRisk && <p className="mt-0.5 text-[11px] text-muted">{t("outage.fridge")}</p>}
      {today && o.ice && <p className="mt-0.5 text-[11px] text-good">{t("outage.icy")}</p>}
      {state.lantern && <p className="mt-0.5 text-[11px] text-good">{t("outage.lantern")}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {today && !o.ice && (
          <button className={BTN} disabled={iceWhy !== null} data-testid="buy-ice" title={iceWhy ? t(`outage.why.${iceWhy}`) : undefined} onClick={() => send({ type: "buyIce" })}>
            {t("outage.buyIce", { price: rp(c.ice.price) })}
          </button>
        )}
        {!state.lantern && (
          <button className={BTN} disabled={lanternWhy !== null} data-testid="buy-lantern" title={lanternWhy ? t(`outage.why.${lanternWhy}`) : undefined} onClick={() => send({ type: "buyLantern" })}>
            {t("outage.buyLantern", { price: rp(c.lantern.price) })}
          </button>
        )}
      </div>
    </div>
  );
}
