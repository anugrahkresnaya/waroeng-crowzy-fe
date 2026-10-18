"use client";

import { useTranslation } from "react-i18next";
import { content, formatClock, outageEnd, plnOff, tokenEmpty, type CommandError } from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";

const BTN = "rounded-full border-2 border-ink bg-panel px-2.5 py-0.5 text-[11px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40";

/** A strip at the top of every game screen while the power is a problem: a PLN cut coming or on, or an electricity token running low. */
export function OutageBanner() {
  const { t } = useTranslation();
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  if (!state) return null;

  const c = content.balance.outage;
  const tk = content.balance.token;
  const o = state.outage;
  const today = !!o && o.day === state.day && state.minute < outageEnd(o);
  const tomorrow = !!o && o.known && o.day === state.day + 1;
  const tokenLow = state.token < tk.lowMark;
  if (!today && !tomorrow && !tokenLow) return null;

  const errandWhy = (): CommandError | null => {
    if (state.phase === "open") return state.busyUntil > 0 ? "busy" : null;
    if (state.phase === "idle") return state.preOpenUsed + c.errandMinutes > content.balance.preOpenMinutes ? "no_time" : null;
    return ["ended", "night", "bed"].includes(state.phase) ? null : "wrong_phase";
  };
  const why = (price: number): CommandError | null => errandWhy() ?? (state.bank < price ? "insufficient_funds" : null);
  const pack = tk.packs[Math.min(1, tk.packs.length - 1)];
  const tokenWhy: CommandError | null = state.bank < pack + tk.fee ? "insufficient_funds" : null;

  return (
    <div className="shrink-0 border-b-2 border-bad/60 bg-bad/10 px-3 py-1.5 text-xs" role="status" data-testid="outage-banner" data-power={plnOff(state) || tokenEmpty(state) ? "off" : "on"}>
      {tokenLow && (
        <div data-testid="token-alert">
          <b className="text-bad">{tokenEmpty(state) ? t("outage.tokenEmpty") : t("outage.tokenLow", { token: rp(state.token) })}</b>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <button className={BTN} disabled={tokenWhy !== null} data-testid="buy-token" onClick={() => send({ type: "buyToken", amount: pack })}>
              {t("outage.buyToken", { amount: rp(pack), fee: rp(tk.fee) })}
            </button>
          </div>
        </div>
      )}
      {(today || tomorrow) && o && (
        <div className={tokenLow ? "mt-1.5 border-t border-bad/30 pt-1.5" : ""}>
          <b className="text-bad">
            {t(today ? (plnOff(state) ? "outage.now" : "outage.today") : "outage.tomorrow", { from: formatClock(o.from), until: formatClock(outageEnd(o)) })}
          </b>
          {today && !o.ice && o.hours > c.fridgeHoldHours && <p className="mt-0.5 text-[11px] text-muted">{t("outage.fridge")}</p>}
          {today && o.ice && <p className="mt-0.5 text-[11px] text-good">{t("outage.icy")}</p>}
          {state.lantern && <p className="mt-0.5 text-[11px] text-good">{t("outage.lantern")}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {today && !o.ice && (
              <button className={BTN} disabled={why(c.ice.price) !== null} data-testid="buy-ice" title={why(c.ice.price) ? t(`outage.why.${why(c.ice.price)}`) : undefined} onClick={() => send({ type: "buyIce" })}>
                {t("outage.buyIce", { price: rp(c.ice.price) })}
              </button>
            )}
            {!state.lantern && (
              <button className={BTN} disabled={why(c.lantern.price) !== null} data-testid="buy-lantern" title={why(c.lantern.price) ? t(`outage.why.${why(c.lantern.price)}`) : undefined} onClick={() => send({ type: "buyLantern" })}>
                {t("outage.buyLantern", { price: rp(c.lantern.price) })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
