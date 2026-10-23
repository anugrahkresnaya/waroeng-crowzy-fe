"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { TopBar } from "@/components/top-bar";
import { Card, Chip, Pill } from "@/components/ui";
import { WarungNav } from "@/components/warung-nav";
import { baseCostPerPortion, content, costPerPortion, goodKey, type Phase, type Portion } from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useGuard } from "@/lib/use-guard";
import { useLocalize } from "@/lib/use-localize";

const ANY: Phase[] = ["idle", "open", "ended", "dayoff", "night", "bed"];
const PORTIONS: Portion[] = ["small", "normal", "large"];

/** The menu: what each dish costs to make at today's prices, what you charge, and the portion size. */
export default function MenuPage() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const ready = useGuard(ANY);
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  if (!ready || !state) return null;

  const dishes = content.items.filter((i) => i.kind === "dish");
  const rising = dishes.filter((d) => costPerPortion(state, content, d) / baseCostPerPortion(content, d, state.menu[d.id].portion) > 1.08);

  return (
    <>
      <TopBar />
      <WarungNav />
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
        <div className="px-1">
          <h1 className="font-display text-2xl font-bold leading-tight">{t("menu.title")}</h1>
          <p className="text-xs text-muted">{t("menu.help")}</p>
        </div>

        {rising.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-warn/50 bg-warn/10 p-3 text-xs" data-testid="menu-spike">
            <span className="w-5 shrink-0">
              <Art id="harga-naik" />
            </span>
            <span className="flex-1">
              <b className="text-warn">{t("menu.spike")}</b> {rising.map((d) => loc(d.name)).join(", ")}.
            </span>
            <Link href="/pasar" className="font-bold text-accent underline">
              {t("menu.seePrices")}
            </Link>
          </div>
        )}

        {dishes.map((item) => {
          const entry = state.menu[item.id];
          const cost = costPerPortion(state, content, item);
          const base = baseCostPerPortion(content, item, entry.portion);
          const trend = ((cost - base) / base) * 100;
          const margin = ((entry.price - cost) / entry.price) * 100;
          const tone = margin < 15 ? "bad" : margin < 30 ? "warn" : "good";
          const label = cost >= entry.price ? t("menu.loss") : margin < 15 ? t("menu.thin") : margin < 30 ? t("menu.fair") : t("menu.healthy");
          return (
            <Card key={item.id} data-testid={`dish-${item.id}`}>
              <div className="flex items-center gap-3 p-3">
                <span className="w-12 shrink-0">
                  <Art id={item.art} />
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <b className="text-sm">{loc(item.name)}</b>
                  {item.reference && <div className="text-[11px] text-muted">{t("menu.reference", { price: rp(item.reference) })}</div>}
                </div>
                <Pill tone={tone}>
                  {label} {Math.round(margin)}%
                </Pill>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-line px-3 py-2 text-center">
                <div className="leading-tight">
                  <div className="text-[10px] text-muted">{t("menu.cost")}</div>
                  <b className="font-mono text-sm tabular-nums" data-testid={`cost-${item.id}`}>
                    {rp(Math.round(cost))}
                  </b>
                  {Math.abs(trend) >= 5 && <div className={`text-[10px] font-bold ${trend > 0 ? "text-bad" : "text-good"}`}>{trend > 0 ? "▲" : "▼"} {Math.abs(Math.round(trend))}%</div>}
                </div>
                <div className="leading-tight">
                  <div className="text-[10px] text-muted">{t("menu.profit")}</div>
                  <b className={`font-mono text-sm tabular-nums ${entry.price - cost < 0 ? "text-bad" : ""}`}>{rp(Math.round(entry.price - cost))}</b>
                </div>
                <div className="leading-tight">
                  <div className="text-[10px] text-muted">{t("menu.price")}</div>
                  <span className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => send({ type: "setDishPrice", item: item.id, price: entry.price - 500 })}
                      data-testid={`price-down-${item.id}`}
                      aria-label={t("menu.lower", { name: loc(item.name) })}
                      className="h-6 w-6 rounded-md border border-line font-bold"
                    >
                      −
                    </button>
                    <b className="min-w-12 font-mono text-sm tabular-nums" data-testid={`price-${item.id}`}>
                      {rp(entry.price)}
                    </b>
                    <button
                      onClick={() => send({ type: "setDishPrice", item: item.id, price: entry.price + 500 })}
                      data-testid={`price-up-${item.id}`}
                      aria-label={t("menu.raise", { name: loc(item.name) })}
                      className="h-6 w-6 rounded-md border border-line font-bold"
                    >
                      +
                    </button>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 border-t border-line px-3 py-2">
                <span className="mr-auto text-[11px] text-muted">{t("menu.portion")}</span>
                {PORTIONS.map((p) => (
                  <Chip key={p} on={entry.portion === p} onClick={() => send({ type: "setPortion", item: item.id, portion: p })} data-testid={`portion-${item.id}-${p}`}>
                    {t(`menu.portions.${p}`)}
                  </Chip>
                ))}
              </div>
              <details className="border-t border-line px-3 py-2 text-xs">
                <summary className="cursor-pointer font-bold text-muted">{t("menu.recipe")}</summary>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {Object.entries(item.recipe ?? {}).map(([id, amount]) => {
                    const ing = content.ingredientById[id];
                    const used = amount * content.market.portion[entry.portion].mul;
                    return (
                      <li key={id} className="flex items-center gap-2">
                        <span className="w-5 shrink-0">
                          <Art id={ing.art} />
                        </span>
                        <span className="flex-1">{loc(ing.name)}</span>
                        <span className="font-mono text-muted tabular-nums">
                          {Math.round(used * 100) / 100} {loc(ing.baseUnit)}
                        </span>
                        <span className="w-14 text-right font-mono tabular-nums">{rp(Math.round((used / ing.unitSize) * state.market.prices[id]))}</span>
                      </li>
                    );
                  })}
                  {Object.entries(item.recipeGoods ?? {}).map(([id, per]) => {
                    const good = content.itemById[id];
                    return (
                      <li key={id} className="flex items-center gap-2">
                        <span className="w-5 shrink-0">
                          <Art id={good.art} />
                        </span>
                        <span className="flex-1">{loc(good.name)}</span>
                        <span className="font-mono text-muted tabular-nums">{per} {t("kitchen.pieces")}</span>
                        <span className="w-14 text-right font-mono tabular-nums">{rp(Math.round(per * (state.market.prices[goodKey(id)] ?? 0) / (good.pack ?? 1)))}</span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </Card>
          );
        })}
      </div>
    </>
  );
}
