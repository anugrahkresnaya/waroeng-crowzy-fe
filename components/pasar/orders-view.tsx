"use client";

import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { Card, Pill } from "@/components/ui";
import { content } from "@/engine";
import { orderStatus } from "@/lib/arrival";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useLocalize } from "@/lib/use-localize";

/** Orders on their way (with a clear warning when one is late) and the last few that arrived. */
export function OrdersView() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const state = useGame((s) => s.state);
  if (!state) return null;
  const orders = [...state.orders].sort((a, b) => (a.status === b.status ? b.id - a.id : a.status === "transit" ? -1 : 1));
  if (orders.length === 0) return <Card className="grid place-items-center p-8 text-center text-xs text-muted">{t("pasar.noOrders")}</Card>;

  return (
    <Card>
      <ul className="divide-y divide-line">
        {orders.map((o) => {
          const status = orderStatus(state, o);
          const names = o.lines
            .map((l) => {
              const p = content.productByKey[l.key];
              const name = p.kind === "good" ? loc(content.itemById[p.id].name) : loc(content.ingredientById[p.id].name);
              return `${name} ×${l.qty}`;
            })
            .join(", ");
          return (
            <li key={o.id} className="flex items-start gap-3 p-3" data-testid={`order-${o.id}`}>
              <span className="w-9 shrink-0">
                <Art id="ikon-truk" />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <b className="text-sm">{t("pasar.orderNo", { n: o.id, supplier: loc(content.supplierById[o.supplier].name) })}</b>
                <span className="block text-[11px] text-muted">{names}</span>
                <span className="mt-0.5 block text-[11px] text-muted">
                  {rp(o.total)}
                  {o.express ? ` · ${t("pasar.expressTag")}` : ""}
                </span>
                <span className={`mt-1 block text-xs ${status.kind === "late" ? "font-bold text-bad" : status.kind === "delivered" ? "text-muted" : ""}`} data-testid={`order-${o.id}-status`}>
                  {status.kind === "delivered" && t("pasar.status.delivered", { weekday: t(`weekday.${status.weekday}`) })}
                  {status.kind === "late" && t("pasar.status.late", { weekday: t(`weekday.${status.weekday}`) })}
                  {status.kind === "hours" && t("pasar.status.hours")}
                  {status.kind === "tomorrow" && t("pasar.status.tomorrow")}
                  {status.kind === "later" && t("pasar.status.later", { weekday: t(`weekday.${status.weekday}`) })}
                </span>
              </span>
              {status.kind === "late" ? <Pill tone="bad">{t("pasar.lateTag")}</Pill> : status.kind === "delivered" ? <Pill>{t("pasar.doneTag")}</Pill> : <Pill tone="warn">{t("pasar.onTheWay")}</Pill>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
