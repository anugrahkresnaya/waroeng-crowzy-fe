"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { OrdersView } from "@/components/pasar/orders-view";
import { TopBar } from "@/components/top-bar";
import { Button, Card, Chip, Meter, Pill } from "@/components/ui";
import { WarungNav } from "@/components/warung-nav";
import { batchesPossible, content, displayPortions, freezerHoldHours, freezerUsed, fridgeUsed, portionsLeft, type Phase } from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useGuard } from "@/lib/use-guard";
import { useLocalize } from "@/lib/use-localize";

const ANY: Phase[] = ["idle", "open", "ended", "dayoff", "night", "bed"];
type Tab = "bahan" | "barang" | "pesanan";

/** The storeroom: ingredients with how long they will last, resale goods, and what is on its way. */
export default function GudangPage() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const ready = useGuard(ANY);
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  const [tab, setTab] = useState<Tab>("bahan");
  if (!ready || !state) return null;

  const used = fridgeUsed(state, content);
  const cap = content.market.fridgeCapacity;
  const groups = content.ingredients
    .map((ing) => {
      const lots = state.pantry.filter((l) => l.ingredient === ing.id);
      const units = lots.reduce((s, l) => s + l.qty, 0) / ing.unitSize;
      const daysLeft = lots.reduce((min, l) => {
        const life = ing.life[l.stored] ?? null;
        return life === null ? min : Math.min(min, l.bought + life - state.day);
      }, Infinity);
      const inFridge = lots.some((l) => l.stored === "fridge");
      const inFreezer = lots.some((l) => l.stored === "freezer");
      return { ing, units, daysLeft, inFridge, inFreezer, lots };
    })
    .filter((g) => g.units > 0);
  const cannotMake = content.items.filter((i) => i.kind === "dish" && (i.batch ? displayPortions(state, i.id) === 0 && batchesPossible(state, content, i) === 0 : portionsLeft(state, content, i.id) === 0));
  const goods = content.items.filter((i) => i.kind === "good" && !i.consign);

  return (
    <>
      <TopBar />
      <WarungNav />
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
        <div className="px-1">
          <h1 className="font-display text-2xl font-bold leading-tight">{t("storage.title")}</h1>
        </div>

        <Card className="grid grid-cols-2 gap-3 p-3">
          <Meter label={t("storage.fridge", { used: used.toFixed(1), cap })} pct={cap > 0 ? (used / cap) * 100 : 0} tone={used / cap > 0.9 ? "bg-warn" : "bg-accent"} />
          <div className="text-[11px] leading-tight text-muted">{t("storage.fridgeHelp")}</div>
        </Card>

        <Card className="p-3" data-testid="freezer-card">
          {state.freezer ? (
            <div className="grid grid-cols-2 gap-3">
              <Meter
                label={t("storage.freezer", { used: freezerUsed(state, content).toFixed(1), cap: content.market.freezerCapacity })}
                pct={(freezerUsed(state, content) / content.market.freezerCapacity) * 100}
                tone="bg-accent"
              />
              <div className="text-[11px] leading-tight text-muted" data-testid="freezer-hold">
                {t("storage.freezerHold", {
                  hours: freezerHoldHours(state, content),
                  full: content.balance.outage.freezerHoldHours,
                  pct: Math.round(content.balance.outage.freezerWellFilled * 100),
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <b className="font-display text-base">{t("storage.noFreezer")}</b>
              <p className="text-[11px] text-muted">{t("storage.freezerBuyHelp")}</p>
              <Button className="py-2" disabled={state.bank < content.market.freezerPrice} data-testid="buy-freezer" onClick={() => send({ type: "buyFreezer" })}>
                {t("storage.buyFreezer", { price: rp(content.market.freezerPrice) })}
              </Button>
              {state.bank < content.market.freezerPrice && <p className="text-[11px] text-muted">{t("pasar.noFunds")}</p>}
            </div>
          )}
        </Card>

        {state.lastSpoiled.length > 0 && (
          <div className="rounded-xl border border-bad/50 bg-bad/10 p-3 text-xs" data-testid="spoiled-report">
            <b className="text-bad">{t("storage.spoiled")}</b>{" "}
            {state.lastSpoiled
              .map((s) =>
                s.good
                  ? `${loc(content.itemById[s.ingredient].name)} ${Math.round(s.qty)} ${t("storage.pcs")}`
                  : `${loc(content.ingredientById[s.ingredient].name)} ${Math.round(s.qty * 10) / 10} ${loc(content.ingredientById[s.ingredient].unit)}`,
              )
              .join(", ")}{" "}
            ·{" "}
            {rp(state.lastSpoiled.reduce((sum, s) => sum + s.value, 0))}
          </div>
        )}

        {cannotMake.length > 0 && (
          <div className="rounded-xl border border-warn/50 bg-warn/10 p-3 text-xs" data-testid="cannot-make">
            <b className="text-warn">{t("storage.cannotMake")}</b> {cannotMake.map((d) => loc(d.name)).join(", ")}.{" "}
            <Link href="/pasar" className="font-bold text-accent underline">
              {t("storage.order")}
            </Link>
          </div>
        )}

        <div className="flex gap-1.5" role="tablist">
          {(["bahan", "barang", "pesanan"] as Tab[]).map((id) => (
            <Chip key={id} role="tab" aria-selected={tab === id} on={tab === id} onClick={() => setTab(id)} data-testid={`storage-${id}`}>
              {t(`storage.tabs.${id}`)}
            </Chip>
          ))}
        </div>

        {tab === "bahan" && (
          <Card>
            {groups.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted">{t("storage.empty")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {groups.map(({ ing, units, daysLeft, inFridge, inFreezer }) => (
                  <li key={ing.id} className="flex items-center gap-3 px-3 py-2" data-testid={`stock-${ing.id}`}>
                    <span className="w-9 shrink-0">
                      <Art id={ing.art} />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <b className="text-sm">{loc(ing.name)}</b>
                      <span className="block font-mono text-[11px] tabular-nums text-muted">
                        {Math.round(units * 10) / 10} {loc(ing.unit)} {inFreezer ? `· ${t("storage.inFreezer")}` : inFridge ? `· ${t("storage.inFridge")}` : ""}
                      </span>
                    </span>
                    {!Number.isFinite(daysLeft) ? (
                      <Pill tone="good">{t("storage.keeps")}</Pill>
                    ) : daysLeft <= 0 ? (
                      <Pill tone="bad">⚠ {t("storage.today")}</Pill>
                    ) : daysLeft <= 1 ? (
                      <Pill tone="warn">{t("storage.days", { n: daysLeft })}</Pill>
                    ) : (
                      <Pill>{t("storage.days", { n: daysLeft })}</Pill>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === "barang" && (
          <Card>
            <ul className="divide-y divide-line">
              {goods.map((item) => {
                const left = state.stock[item.id] ?? 0;
                return (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2" data-testid={`goods-${item.id}`}>
                    <span className="w-9 shrink-0">
                      <Art id={item.art} />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <b className="text-sm">{loc(item.name)}</b>
                      {item.frozen && <span className="ml-1.5 align-middle"><Pill tone="mute">{t("storage.frozen")}</Pill></span>}
                      <span className="block text-[11px] text-muted">{t("storage.goodsCost", { price: rp(Math.round(state.goodsCost[item.id] ?? 0)) })}</span>
                    </span>
                    <b className={`font-mono text-sm tabular-nums ${left <= 5 ? "text-bad" : ""}`}>{left}</b>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {tab === "pesanan" && <OrdersView />}
      </div>
    </>
  );
}
