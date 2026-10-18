"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { Spark } from "@/components/pasar/spark";
import { Card, Chip } from "@/components/ui";
import { content, goodKey } from "@/engine";
import { rb, rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useLocalize } from "@/lib/use-localize";

const CATEGORIES = ["all", "pokok", "protein", "sayur", "minuman", "perlengkapan"] as const;

/** Percent change of a product's price against a week ago, from its history. */
export function weekChange(history: number[]): number {
  if (history.length < 8) return 0;
  const before = history[history.length - 8];
  return ((history[history.length - 1] - before) / before) * 100;
}

export function ChangeBadge({ pct }: { pct: number }) {
  const rising = pct > 3;
  const falling = pct < -3;
  return (
    <span className={`font-mono text-[11px] font-bold ${rising ? "text-bad" : falling ? "text-good" : "text-muted"}`}>
      {rising ? "▲ " : falling ? "▼ " : "— "}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/** The ingredient prices, with a filter and a trend per row. */
export function PriceList({ onOpen }: { onOpen: (key: string) => void }) {
  const { t } = useTranslation();
  const loc = useLocalize();
  const market = useGame((s) => s.state?.market);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  if (!market) return null;
  const rows = content.ingredients.filter((i) => category === "all" || i.category === category);
  return (
    <>
      <div className="scroll-thin -mx-3 flex gap-1.5 overflow-x-auto px-3" role="group" aria-label={t("pasar.categories")}>
        {CATEGORIES.map((c) => (
          <Chip key={c} on={c === category} onClick={() => setCategory(c)}>
            {t(`pasar.category.${c}`)}
          </Chip>
        ))}
      </div>
      <Card>
        <ul className="divide-y divide-line">
          {rows.map((ing) => {
            const history = market.history[ing.id];
            const change = weekChange(history);
            return (
              <li key={ing.id}>
                <button onClick={() => onOpen(ing.id)} data-testid={`product-${ing.id}`} className="flex w-full items-center gap-3 px-3 py-2 text-left">
                  <span className="w-9 shrink-0">
                    <Art id={ing.art} />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <b className="text-sm">{loc(ing.name)}</b>
                    <span className="block text-[11px] text-muted">{t("pasar.per", { unit: loc(ing.unit) })}</span>
                  </span>
                  <Spark values={history.slice(-14)} rising={change > 3} />
                  <span className="w-20 text-right leading-tight">
                    <b className="block font-mono text-sm tabular-nums">{rp(market.prices[ing.id])}</b>
                    <ChangeBadge pct={change} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

/** Resale goods: bought by the pack, sold by the piece. */
export function GoodsList({ onOpen }: { onOpen: (key: string) => void }) {
  const { t } = useTranslation();
  const loc = useLocalize();
  const market = useGame((s) => s.state?.market);
  if (!market) return null;
  return (
    <Card>
      <ul className="divide-y divide-line">
        {content.items
          .filter((i) => i.kind === "good")
          .map((item) => {
            const key = goodKey(item.id);
            const pack = item.pack ?? 1;
            const perPiece = market.prices[key] / pack;
            const margin = ((item.price - perPiece) / item.price) * 100;
            return (
              <li key={item.id}>
                <button onClick={() => onOpen(key)} data-testid={`product-${key}`} className="flex w-full items-center gap-3 px-3 py-2 text-left">
                  <span className="w-9 shrink-0">
                    <Art id={item.art} />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <b className="text-sm">{loc(item.name)}</b>
                    {item.frozen && <span className="ml-1.5 text-[10px] font-bold text-accent" data-testid={`frozen-${item.id}`}>❄ {t("pasar.frozenTag")}</span>}
                    <span className="block text-[11px] text-muted">
                      {t("pasar.pack", { n: pack })} · {t("pasar.sellsFor", { price: rb(item.price) })}
                    </span>
                  </span>
                  <span className="w-24 text-right leading-tight">
                    <b className="block font-mono text-sm tabular-nums">{rp(market.prices[key])}</b>
                    <span className={`font-mono text-[11px] font-bold ${margin < 15 ? "text-bad" : "text-muted"}`}>{t("pasar.margin", { pct: Math.round(margin) })}</span>
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
    </Card>
  );
}
