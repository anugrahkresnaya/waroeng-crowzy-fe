"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { Button, Chip } from "@/components/ui";
import { content, type Customer } from "@/engine";
import { useCounterUi } from "@/lib/counter-ui-store";
import { rb, rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useLocalize } from "@/lib/use-localize";

const CATEGORIES = ["makanan", "minuman", "lainnya"] as const;

/** Stage 1 at the counter: pick what the customer asked for, check ID if needed, confirm. */
export function Ordering({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const loc = useLocalize();
  const send = useGame((s) => s.send);
  const stock = useGame((s) => s.state?.stock ?? {});
  const wrongTrays = useGame((s) => s.state?.stats.wrongTrays ?? 0);
  const category = useCounterUi((s) => s.category);
  const setCategory = useCounterUi((s) => s.setCategory);

  const [shake, setShake] = useState(false);
  const [seenWrong, setSeenWrong] = useState(wrongTrays);
  if (wrongTrays !== seenWrong) {
    setSeenWrong(wrongTrays);
    setShake(true);
  }
  useEffect(() => {
    if (!shake) return;
    const timer = setTimeout(() => setShake(false), 300);
    return () => clearTimeout(timer);
  }, [shake]);

  const restricted = customer.order.some((l) => content.itemById[l.itemId].ageRestricted);
  const trayEntries = Object.entries(customer.tray);

  return (
    <>
      <ul className="mb-2 divide-y divide-line rounded-xl border border-line bg-panel px-3" aria-label={t("counter.request")}>
        {customer.order.map((line) => {
          const have = customer.tray[line.itemId] ?? 0;
          const tone = have === line.qty ? "text-good" : have > line.qty ? "text-bad" : "text-muted";
          return (
            <li key={line.itemId} className="flex items-center gap-2 py-1">
              <span className="w-6">
                <Art id={content.itemById[line.itemId].art} />
              </span>
              <span className="flex-1 text-[13px]">{loc(content.itemById[line.itemId].name)}</span>
              <span className={`font-mono text-xs tabular-nums ${tone}`}>
                {have}/{line.qty}
              </span>
              <button
                onClick={() => send({ type: "declineItem", itemId: line.itemId })}
                className="rounded-md border border-line px-2 py-0.5 text-[11px] font-bold text-muted"
              >
                {t("counter.decline")}
              </button>
            </li>
          );
        })}
      </ul>

      <div
        data-drop="tray"
        data-testid="tray"
        className={`mb-2 flex min-h-[48px] flex-wrap items-center gap-1.5 rounded-xl border-2 border-dashed border-line p-2 ${shake ? "shake" : ""}`}
      >
        {trayEntries.length === 0 ? (
          <span className="text-xs text-muted">{t("counter.trayHint")}</span>
        ) : (
          trayEntries.map(([id, qty]) => (
            <button
              key={id}
              onClick={() => send({ type: "unpick", itemId: id })}
              aria-label={t("counter.remove", { item: loc(content.itemById[id].name) })}
              className="flex items-center gap-1 rounded-lg border border-line bg-bg py-1 pl-1 pr-2 text-xs font-bold"
            >
              <span className="w-6">
                <Art id={content.itemById[id].art} />
              </span>
              {qty}
              <span className="ml-1 text-muted">×</span>
            </button>
          ))
        )}
      </div>

      <div className="mb-2 flex gap-1.5">
        {CATEGORIES.map((c) => (
          <Chip key={c} on={c === category} onClick={() => setCategory(c)} data-testid={`cat-${c}`}>
            {t(`category.${c}`)}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {content.items
          .filter((i) => i.category === category)
          .map((item) => {
            const left = (stock[item.id] ?? 0) - (customer.tray[item.id] ?? 0);
            return (
              <button
                key={item.id}
                data-drag={`item:${item.id}`}
                data-testid={`item-${item.id}`}
                aria-label={`${loc(item.name)}, ${rp(item.price)}`}
                className={`tile relative flex flex-col items-center gap-0.5 rounded-xl border border-line bg-panel p-1.5 ${left <= 0 ? "opacity-40" : ""}`}
              >
                <span className="w-11">
                  <Art id={item.art} />
                </span>
                <span className="w-full truncate text-center text-[11px] font-bold leading-tight">{loc(item.name)}</span>
                <span className="font-mono text-[10px] tabular-nums text-muted">{rb(item.price)}</span>
                <span className={`absolute right-1 top-1 rounded-full bg-bg px-1 font-mono text-[9px] tabular-nums ${left < 6 ? "text-bad" : "text-muted"}`}>
                  {left}
                </span>
              </button>
            );
          })}
      </div>

      <div className="sticky bottom-0 -mx-3 mt-3 flex items-center gap-2 border-t border-line bg-bg px-3 pt-2">
        <div className="mr-auto leading-tight">
          <div className="text-[11px] text-muted">{t("counter.bill")}</div>
          <div className="font-mono text-base font-medium tabular-nums">{rp(customer.bill)}</div>
        </div>
        {restricted && !customer.ktpChecked && (
          <Button variant="ghost" onClick={() => send({ type: "checkKtp" })}>
            {t("counter.checkKtp")}
          </Button>
        )}
        <Button onClick={() => send({ type: "confirmOrder" })} data-testid="confirm-order">
          {t("counter.confirm")}
        </Button>
      </div>
    </>
  );
}
