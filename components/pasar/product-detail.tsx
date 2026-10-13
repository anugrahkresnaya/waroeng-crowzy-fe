"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { LineChart } from "@/components/line-chart";
import { ChangeBadge, weekChange } from "@/components/pasar/price-list";
import { Button, Card } from "@/components/ui";
import { content, roundPrice } from "@/engine";
import { recentLabels } from "@/lib/dates";
import { useCart } from "@/lib/cart-store";
import { rb, rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useLocalize } from "@/lib/use-localize";

/** One product: its 30-day chart, any news that touches it, what each supplier charges, and a way to add it. */
export function ProductDetail({ productKey, onBack, onCart }: { productKey: string; onBack: () => void; onCart: () => void }) {
  const { t, i18n } = useTranslation();
  const loc = useLocalize();
  const state = useGame((s) => s.state);
  const qty = useCart((s) => s.lines[productKey] ?? 0);
  const add = useCart((s) => s.add);
  const setQty = useCart((s) => s.setQty);
  const [table, setTable] = useState(false);
  if (!state) return null;

  const product = content.productByKey[productKey];
  const history = state.market.history[productKey];
  const labels = recentLabels(state.day, history.length, i18n.language);
  const price = state.market.prices[productKey];
  const item = product.kind === "good" ? content.itemById[product.id] : null;
  const ing = product.kind === "ingredient" ? content.ingredientById[product.id] : null;
  const name = item ? loc(item.name) : loc(ing!.name);
  const unit = item ? t("pasar.packWord") : loc(ing!.unit);

  // events that move this product, with where their start falls on the chart
  const touches = (tokens: string[]) => tokens.some((tok) => tok === "all" || tok === product.category || tok === product.id);
  const relevant = content.market.events.filter((e) => e.effects.some((f) => touches(f.match)));
  const marks = state.market.active
    .filter((a) => relevant.some((e) => e.id === a.id) && state.day - a.start < history.length && a.start <= state.day)
    .map((a) => ({ index: history.length - 1 - (state.day - a.start), label: t(`pasar.event.${a.id}`) }));
  const news = state.market.news.filter((n) => relevant.some((e) => e.id === n.event) && state.day - n.day <= 4);

  return (
    <>
      <button onClick={onBack} className="self-start text-xs font-bold text-accent">
        ‹ {t("pasar.allProducts")}
      </button>
      <Card className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-3">
          <span className="w-12 shrink-0">
            <Art id={item ? item.art : ing!.art} />
          </span>
          <div className="flex-1 leading-tight">
            <b className="font-display text-lg">{name}</b>
            <div className="text-[11px] text-muted">{t("pasar.last30", { unit })}</div>
          </div>
          <div className="text-right leading-tight">
            <b className="block font-mono text-lg tabular-nums">{rp(price)}</b>
            <ChangeBadge pct={weekChange(history)} />
          </div>
        </div>

        {table ? (
          <div className="max-h-44 overflow-y-auto rounded-lg border border-line">
            <table className="w-full text-xs">
              <tbody>
                {history
                  .map((v, i) => [labels[i], v] as const)
                  .reverse()
                  .slice(0, 14)
                  .map(([label, v]) => (
                    <tr key={label} className="border-b border-line last:border-0">
                      <td className="px-2 py-1 text-muted">{label}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{rp(v)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <LineChart values={history} labels={labels} ariaLabel={t("pasar.chartLabel", { name })} format={rp} tick={rb} marks={marks} />
        )}
        <button onClick={() => setTable(!table)} className="self-end text-[11px] font-bold text-muted underline">
          {table ? t("pasar.showChart") : t("pasar.showTable")}
        </button>

        {news.map((n) => (
          <div key={`${n.day}-${n.event}`} className="flex items-start gap-2 rounded-lg bg-warn/10 p-2 text-[11px]" data-testid="product-news">
            <span className="w-4 shrink-0">
              <Art id="ikon-lonceng" />
            </span>
            <span>{t(`pasar.news.${n.event}`, { starts: n.startsOn <= state.day ? t("pasar.alreadyUnderway") : t("pasar.soon") })}</span>
          </div>
        ))}
      </Card>

      <Card className="p-3">
        <div className="mb-1 text-xs font-bold">{t("pasar.suppliers")}</div>
        <ul className="flex flex-col gap-1 text-xs">
          {content.suppliers.map((s) => (
            <li key={s.id} className="flex justify-between">
              <span className="text-muted">{loc(s.name)}</span>
              <b className="font-mono tabular-nums">{rp(roundPrice(price * s.priceMul))}</b>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex items-center gap-2 p-3">
        <span className="text-xs text-muted">{t("pasar.qty")}</span>
        <button onClick={() => setQty(productKey, qty - 1)} className="h-7 w-7 rounded-md border border-line font-bold" aria-label={t("pasar.less")}>
          −
        </button>
        <b className="w-8 text-center font-mono tabular-nums" data-testid="detail-qty">
          {qty}
        </b>
        <button onClick={() => add(productKey)} className="h-7 w-7 rounded-md border border-line font-bold" aria-label={t("pasar.more")} data-testid="detail-plus">
          +
        </button>
        <Button
          className="ml-auto px-3! py-2! text-xs!"
          data-testid="to-cart"
          onClick={() => {
            if (qty === 0) add(productKey);
            onCart();
          }}
        >
          {t("pasar.toCart")}
        </Button>
      </Card>
    </>
  );
}
