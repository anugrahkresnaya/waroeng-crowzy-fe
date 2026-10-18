"use client";

import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { TopBar } from "@/components/top-bar";
import { Button, Card, Meter, Pill } from "@/components/ui";
import { WarungNav } from "@/components/warung-nav";
import {
  absoluteMinute, batchesPossible, content, costPerPortion, dishNeeds, displayPortions, gasPrice, gasShort, gasTanks, type CommandError, type Item, type Phase,
} from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useGuard } from "@/lib/use-guard";
import { useLocalize } from "@/lib/use-localize";

const ANY: Phase[] = ["idle", "open", "ended", "dayoff", "night", "bed"];

/** The kitchen: cook batches ahead for the display, see how long they stay fresh, and what is cooked to order. */
export default function DapurPage() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const ready = useGuard(ANY);
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  if (!ready || !state) return null;

  const b = content.balance;
  const canCook = state.phase === "idle" || state.phase === "open";
  const left = b.preOpenMinutes - state.preOpenUsed;
  const now = absoluteMinute(state);
  const batchDishes = content.items.filter((i) => i.batch);
  const orderDishes = content.items.filter((i) => i.kind === "dish" && !i.batch);

  const why = (item: Item): CommandError | null => {
    if (!canCook) return "wrong_phase";
    if (state.phase === "idle" && item.batch!.minutes > left) return "no_time";
    if (state.phase === "open" && state.busyUntil > 0) return "busy";
    if (state.phase === "open" && !state.shelfReady) return "shelves_not_ready";
    if (gasShort(state, content, item, item.batch!.portions)) return "out_of_gas";
    if (batchesPossible(state, content, item) < 1) return "missing_ingredients";
    return null;
  };
  const tanks = gasTanks(state, content);
  const nearby = gasPrice(state, content);
  const gasWhy = (): CommandError | null => {
    if (!canCook) return "wrong_phase";
    if (state.phase === "open" && state.busyUntil > 0) return "busy";
    if (state.phase === "idle" && b.gas.nearbyMinutes > left) return "no_time";
    if (state.bank < nearby) return "insufficient_funds";
    return null;
  };
  const gasBlocked = gasWhy();
  const freshLeft = (item: Item) => {
    const batches = state.display[item.id] ?? [];
    if (batches.length === 0) return 0;
    return Math.max(0, batches[0].cookedAt + item.batch!.freshMinutes - now);
  };

  return (
    <>
      <TopBar />
      <WarungNav />
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
        <div className="px-1">
          <h1 className="font-display text-2xl font-bold leading-tight">{t("kitchen.title")}</h1>
          <p className="text-xs text-muted">{t("kitchen.help")}</p>
        </div>

        {state.phase === "idle" && (
          <Card className="p-3">
            <Meter label={t("kitchen.timeLeft", { left, total: b.preOpenMinutes })} pct={(state.preOpenUsed / b.preOpenMinutes) * 100} tone="bg-warn" />
            <p className="mt-1.5 text-[11px] text-muted">{t("kitchen.prepareNote", { minutes: b.prepareMinutes })}</p>
          </Card>
        )}
        {state.phase === "open" && state.busyUntil > 0 && (
          <div className="rounded-xl border border-warn/50 bg-warn/10 p-3 text-xs font-bold text-warn" role="status" data-testid="cooking-busy">
            {t("kitchen.cooking")}
          </div>
        )}
        {!canCook && <p className="px-1 text-xs text-muted">{t("kitchen.closed")}</p>}

        <Card className="p-3" data-testid="gas-card">
          <h2 className="font-display text-base font-bold">{t("kitchen.gas.title")}</h2>
          <Meter
            label={tanks > 0 ? t("kitchen.gas.tanks", { tanks: (Math.round(tanks * 10) / 10).toString() }) : t("kitchen.gas.empty")}
            pct={tanks * 100}
            tone={tanks < 0.15 ? "bg-bad" : "bg-accent"}
          />
          <p className="mt-1.5 text-[11px] text-muted">{t("kitchen.gas.help", { minutes: b.gas.nearbyMinutes })}</p>
          <Button className="mt-2 w-full py-2" variant="soft" disabled={gasBlocked !== null} data-testid="buy-gas" onClick={() => send({ type: "buyGas" })}>
            {t("kitchen.gas.buy", { price: rp(nearby) })}
          </Button>
          {gasBlocked && canCook && <p className="mt-1 text-center text-[11px] text-muted">{t(`kitchen.gas.why.${gasBlocked}`)}</p>}
        </Card>

        <ul className="flex flex-col gap-3">
          {batchDishes.map((item) => {
            const batch = item.batch!;
            const qty = displayPortions(state, item.id);
            const blocked = why(item);
            const fresh = freshLeft(item);
            return (
              <li key={item.id}>
                <Card className="p-3" data-testid={`batch-${item.id}`}>
                  <div className="flex items-center gap-3">
                    <span className="w-12 shrink-0">
                      <Art id={item.art} />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <b className="text-sm">{loc(item.name)}</b>
                      <span className="block text-[11px] text-muted">{t("kitchen.perBatch", { portions: batch.portions, minutes: batch.minutes })}</span>
                      <span className="block text-[11px] text-muted">{t("kitchen.cost", { price: rp(Math.round(costPerPortion(state, content, item))) })}</span>
                    </span>
                    <span className="text-right leading-tight">
                      <span className="block text-[10px] text-muted">{t("kitchen.onDisplay")}</span>
                      <b className={`font-mono text-lg tabular-nums ${qty === 0 ? "text-bad" : ""}`} data-testid={`display-${item.id}`}>
                        {qty}
                      </b>
                    </span>
                  </div>
                  {qty > 0 && (
                    <div className="mt-1.5">
                      <Pill tone={fresh <= 60 ? "warn" : "mute"}>{t("kitchen.freshLeft", { h: Math.floor(fresh / 60), m: fresh % 60 })}</Pill>
                    </div>
                  )}
                  <details className="mt-2 text-[11px] text-muted">
                    <summary className="cursor-pointer font-bold">{t("kitchen.needs")}</summary>
                    <ul className="mt-1 grid grid-cols-2 gap-x-3">
                      {Object.entries(dishNeeds(state, content, item)).map(([id, amount]) => {
                        const ing = content.ingredientById[id];
                        return (
                          <li key={id}>
                            {loc(ing.name)} {Math.round(amount * batch.portions)} {loc(ing.baseUnit)}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                  <Button className="mt-2 w-full py-2" disabled={blocked !== null} data-testid={`cook-${item.id}`} onClick={() => send({ type: "cookBatch", item: item.id, batches: 1 })}>
                    {t("kitchen.cook")}
                  </Button>
                  {blocked && canCook && <p className="mt-1 text-center text-[11px] text-muted">{t(`kitchen.cookWhy.${blocked}`)}</p>}
                </Card>
              </li>
            );
          })}
        </ul>

        {state.phase !== "ended" && (
          <p className="px-1 text-[11px] text-muted">{t("kitchen.batchSale")}</p>
        )}

        <Card className="p-3">
          <h2 className="font-display text-base font-bold">{t("kitchen.orderDishes")}</h2>
          <p className="mb-2 text-[11px] text-muted">{t("kitchen.orderDishesHelp")}</p>
          <div className="flex flex-wrap gap-2">
            {orderDishes.map((d) => (
              <span key={d.id} className="flex items-center gap-1.5 rounded-full border border-line px-2 py-1 text-xs font-bold">
                <span className="w-5">
                  <Art id={d.art} />
                </span>
                {loc(d.name)}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
