"use client";

import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { Button, Card, Chip } from "@/components/ui";
import { content, onPasarTrip, pasarQuote, phoneGate, quoteOrder } from "@/engine";
import { arrivalIfPlacedNow, type Arrival } from "@/lib/arrival";
import { cartLines, useCart } from "@/lib/cart-store";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useLocalize } from "@/lib/use-localize";

function ArrivalText({ arrival }: { arrival: Arrival }) {
  const { t } = useTranslation();
  switch (arrival.kind) {
    case "hours":
      return <>{t("pasar.arrive.hours", { hours: content.market.ordering.expressMinutes / 60 })}</>;
    case "tomorrowMorning":
      return <>{t("pasar.arrive.tomorrowMorning")}</>;
    case "tomorrow":
      return <>{t("pasar.arrive.tomorrow")}</>;
    case "dayAfter":
      return <>{t("pasar.arrive.dayAfter", { weekday: t(`weekday.${arrival.weekday}`) })}</>;
  }
}

/** The basket: pick a supplier, see the total and when it would arrive, and pay from the bank. On a pasar trip it buys on the spot. */
export function CartView({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const loc = useLocalize();
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  const cart = useCart();
  if (!state) return null;

  const lines = cartLines(cart.lines);
  const trip = onPasarTrip(state, content);
  const nameOf = (key: string) => {
    const p = content.productByKey[key];
    return p.kind === "good" ? loc(content.itemById[p.id].name) : loc(content.ingredientById[p.id].name);
  };
  const artOf = (key: string) => {
    const p = content.productByKey[key];
    return p.kind === "good" ? content.itemById[p.id].art : content.ingredientById[p.id].art;
  };
  const unitOf = (key: string) => {
    const p = content.productByKey[key];
    return p.kind === "good" ? t("pasar.packWord") : loc(content.ingredientById[p.id].unit);
  };

  if (lines.length === 0) {
    return <Card className="grid place-items-center p-8 text-center text-xs text-muted">{t("pasar.cartEmpty")}</Card>;
  }

  if (trip) {
    const q = pasarQuote(state, content, lines);
    const enough = state.bank >= q.total;
    return (
      <>
        <Card className="border-accent! p-3 text-xs">
          <b>{t("pasar.tripTitle")}</b>
          <p className="mt-1 text-muted">{t("pasar.tripHelp", { pct: content.market.pasar.haggle * 100 })}</p>
        </Card>
        <Card>
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <CartRow key={l.key} k={l.key} qty={l.qty} price={state.market.prices[l.key]} name={nameOf(l.key)} art={artOf(l.key)} unit={unitOf(l.key)} />
            ))}
          </ul>
          <div className="flex flex-col gap-1 border-t border-line p-3 text-sm">
            <Line label={t("pasar.subtotalMarket")} value={rp(q.subtotal)} />
            <Line label={q.off > 0 ? t("pasar.bulkOff", { pct: q.off * 100 }) : t("pasar.bulkNone", { min: rp(content.market.pasar.grosir[0].min) })} value={q.off > 0 ? `-${rp(q.subtotal - q.total)}` : "—"} />
            <Line label={t("pasar.totalApprox")} value={rp(q.total)} bold />
          </div>
        </Card>
        <Button
          disabled={!enough}
          data-testid="trip-buy"
          onClick={() => {
            const r = send({ type: "pasarTrip", lines });
            if (r.ok) {
              cart.clear();
              onDone();
            }
          }}
        >
          {enough ? t("pasar.tripBuy", { total: rp(q.total) }) : t("pasar.noFunds")}
        </Button>
      </>
    );
  }

  const supplier = content.supplierById[cart.supplier];
  const q = quoteOrder(state, content, cart.supplier, lines, cart.express);
  const belowMin = q.subtotal < supplier.minOrder;
  const enough = state.bank >= q.total;
  const arrival = arrivalIfPlacedNow(state, content, cart.express);
  const gate = phoneGate(state, content, content.balance.phone.dataCosts.order);

  return (
    <>
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={t("pasar.suppliers")}>
        {content.suppliers.map((s) => {
          const on = s.id === cart.supplier;
          return (
            <button
              key={s.id}
              role="radio"
              aria-checked={on}
              data-testid={`supplier-${s.id}`}
              onClick={() => cart.setSupplier(s.id)}
              className={`flex items-center gap-3 rounded-xl border bg-panel p-2.5 text-left ${on ? "border-accent ring-2 ring-accent/40" : "border-line"}`}
            >
              <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${on ? "border-accent" : "border-line"}`}>{on && <span className="h-2 w-2 rounded-full bg-accent" />}</span>
              <span className="min-w-0 flex-1 leading-tight">
                <b className="text-sm">{loc(s.name)}</b>
                <span className="block text-[11px] text-muted">
                  {s.priceMul < 1 ? t("pasar.cheaper", { pct: Math.round((1 - s.priceMul) * 100) }) : s.priceMul > 1 ? t("pasar.dearer", { pct: Math.round((s.priceMul - 1) * 100) }) : t("pasar.marketPrice")} ·{" "}
                  {s.minOrder > 0 ? t("pasar.minOrder", { min: rp(s.minOrder) }) : t("pasar.noMin")} · {s.lateChance >= 0.15 ? t("pasar.oftenLate") : s.lateChance <= 0.06 ? t("pasar.reliable") : t("pasar.sometimesLate")}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Card>
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <CartRow key={l.key} k={l.key} qty={l.qty} price={q.priced.find((p) => p.key === l.key)!.unitPrice} name={nameOf(l.key)} art={artOf(l.key)} unit={unitOf(l.key)} />
          ))}
        </ul>
        <div className="flex flex-col gap-1 border-t border-line p-3 text-sm">
          <Line label={t("pasar.subtotal")} value={rp(q.subtotal)} />
          <Line label={cart.express ? t("pasar.expressFee") : q.fee === 0 ? t("pasar.feeFree", { min: rp(supplier.freeAbove ?? 0) }) : t("pasar.fee")} value={rp(q.fee)} />
          <Line label={t("pasar.total")} value={rp(q.total)} bold />
        </div>
      </Card>

      <label className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3 text-sm">
        <input type="checkbox" checked={cart.express} onChange={(e) => cart.setExpress(e.target.checked)} data-testid="express" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        <span className="leading-tight">
          <b>{t("pasar.express")}</b>
          <span className="block text-[11px] text-muted">{t("pasar.expressHelp", { fee: rp(content.market.ordering.expressFee) })}</span>
        </span>
      </label>

      <Card className="p-3 text-xs" data-testid="arrival">
        <span className="text-muted">{t("pasar.arrives")}</span> <b><ArrivalText arrival={arrival} /></b>
        <p className="mt-1 text-[11px] text-muted">{t("pasar.cutoffHint", { time: "20.00" })}</p>
      </Card>

      {belowMin && <p className="text-xs text-bad" role="alert">{t("pasar.belowMin", { min: rp(supplier.minOrder) })}</p>}
      {!belowMin && !enough && <p className="text-xs text-bad" role="alert">{t("pasar.noFunds")}</p>}
      {gate && <p className="text-xs text-bad" role="alert" data-testid="phone-gate">{t(gate === "phone_dead" ? "pasar.noPhone" : "pasar.noData")}</p>}
      <Button
        data-testid="pay-order"
        disabled={belowMin || !enough || gate !== null}
        onClick={() => {
          const r = send({ type: "placeOrder", supplier: cart.supplier, lines, express: cart.express });
          if (r.ok) {
            cart.clear();
            onDone();
          }
        }}
      >
        {t("pasar.pay", { total: rp(q.total) })}
      </Button>
    </>
  );
}

function Line({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span className={bold ? "" : "text-muted"}>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function CartRow({ k, qty, price, name, art, unit }: { k: string; qty: number; price: number; name: string; art: string; unit: string }) {
  const { t } = useTranslation();
  const setQty = useCart((s) => s.setQty);
  return (
    <li className="flex items-center gap-2 px-3 py-2" data-testid={`cart-${k}`}>
      <span className="w-9 shrink-0">
        <Art id={art} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <b className="text-sm">{name}</b>
        <span className="block text-[11px] text-muted">
          {rp(price)} / {unit}
        </span>
      </span>
      <button onClick={() => setQty(k, qty - 1)} className="h-6 w-6 rounded-md border border-line font-bold" aria-label={t("pasar.less")}>
        −
      </button>
      <b className="w-6 text-center font-mono text-sm tabular-nums">{qty}</b>
      <button onClick={() => setQty(k, qty + 1)} className="h-6 w-6 rounded-md border border-line font-bold" aria-label={t("pasar.more")}>
        +
      </button>
      <b className="w-20 text-right font-mono text-sm tabular-nums">{rp(price * qty)}</b>
    </li>
  );
}

export { Chip };
