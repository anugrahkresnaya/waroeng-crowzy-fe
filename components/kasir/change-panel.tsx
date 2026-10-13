"use client";

import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { Button } from "@/components/ui";
import { DENOMS, total, type Customer } from "@/engine";
import { useCounterUi } from "@/lib/counter-ui-store";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";

const pieceArt = (d: number) => (d >= 1000 ? `uang-${d}` : `koin-${d}`);
const pieceWidth = (d: number) => (d >= 1000 ? "w-full" : "mx-auto w-9");

/** Stage 3 for cash: count the change out of the drawer into the customer's hand. */
export function ChangePanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const drawer = useGame((s) => s.state?.drawer ?? {});
  const send = useGame((s) => s.send);
  const given = useCounterUi((s) => s.given);
  const removePiece = useCounterUi((s) => s.removePiece);
  const clear = useCounterUi((s) => s.clear);

  const tender = total(customer.tender);
  const due = tender - customer.bill;
  const handed = total(given);
  const diff = handed - due;
  const status =
    diff === 0
      ? { text: t("change.exact"), tone: "text-good" }
      : diff < 0
        ? { text: t("change.short", { amount: rp(-diff) }), tone: "text-bad" }
        : { text: t("change.over", { amount: rp(diff) }), tone: "text-warn" };

  return (
    <>
      <div className="mb-2 flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
        <div className="flex flex-col gap-1">
          {DENOMS.flatMap((d) => Array.from({ length: customer.tender[d] ?? 0 }, (_, i) => (
            <span key={`${d}-${i}`} className="w-20">
              <Art id={pieceArt(d)} />
            </span>
          )))}
        </div>
        <div className="ml-auto text-right leading-tight">
          <div className="text-[11px] text-muted">{t("change.received", { amount: rp(tender) })}</div>
          <div className="text-[11px] text-muted">{t("change.billLine", { amount: rp(customer.bill) })}</div>
          <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-muted">{t("change.title")}</div>
          <div className="font-mono text-2xl font-medium tabular-nums" data-testid="change-due">
            {rp(due)}
          </div>
        </div>
      </div>

      <div className="mb-1 flex items-center justify-between text-xs">
        <b>{t("change.hand")}</b>
        <b className={`font-mono tabular-nums ${status.tone}`} data-testid="change-status">
          {rp(handed)} · {status.text}
        </b>
      </div>
      <div data-drop="hand" className="mb-2 flex min-h-[52px] flex-wrap items-center gap-1.5 rounded-xl border-2 border-dashed border-line p-2">
        {DENOMS.filter((d) => given[d]).map((d) => (
          <button
            key={d}
            onClick={() => removePiece(d)}
            aria-label={t("change.takeBack", { amount: rp(d) })}
            className="flex items-center gap-1 rounded-lg border border-line bg-bg py-0.5 pl-0.5 pr-2 text-xs font-bold"
          >
            <span className={d >= 1000 ? "w-10" : "w-8"}>
              <Art id={pieceArt(d)} />
            </span>
            {given[d]}
          </button>
        ))}
        {handed === 0 && <span className="text-xs text-muted">{t("change.handHint")}</span>}
      </div>

      <div className="mb-1 flex items-center gap-1.5 text-xs">
        <span className="w-6">
          <Art id="laci-uang" />
        </span>
        <b>{t("change.drawer")}</b>
        <span className="text-muted">· {t("change.lowHint")}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {DENOMS.map((d) => {
          const left = (drawer[d] ?? 0) + (customer.tender[d] ?? 0) - (given[d] ?? 0);
          return (
            <button
              key={d}
              data-drag={`piece:${d}`}
              data-testid={`piece-${d}`}
              aria-label={t("change.giveAria", { amount: rp(d) })}
              className={`tile relative rounded-xl border border-line bg-panel p-1 ${left <= 0 ? "opacity-35" : ""}`}
            >
              <span className={`block ${pieceWidth(d)}`}>
                <Art id={pieceArt(d)} />
              </span>
              <span className={`absolute right-1 top-1 rounded-full bg-bg px-1 font-mono text-[10px] font-bold tabular-nums ${left < 3 && d < 20000 ? "text-bad" : ""}`}>
                {left}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-3 mt-3 flex gap-2 border-t border-line bg-bg px-3 pt-2">
        <Button variant="ghost" onClick={clear}>
          {t("change.clear")}
        </Button>
        <Button
          className="flex-1"
          data-testid="give-change"
          onClick={() => {
            const r = send({ type: "giveChange", pieces: given });
            if (r.ok) clear();
          }}
        >
          {t("change.give")}
        </Button>
      </div>
    </>
  );
}
