"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { MoodMeters } from "@/components/mood-meters";
import { MorningReport } from "@/components/morning-report";
import { TopBar } from "@/components/top-bar";
import { WarungNav } from "@/components/warung-nav";
import { Button, Card, Chip } from "@/components/ui";
import { DENOMS, content, displayPortions, exchangeBreakdown } from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useGuard } from "@/lib/use-guard";
import { useLocalize } from "@/lib/use-localize";

const IDLE: ["idle"] = ["idle"];
const AMOUNTS = [50000, 100000, 150000];
const pieceArt = (d: number) => (d >= 1000 ? `uang-${d}` : `koin-${d}`);

type Choice = "siapkan" | "tidur";

export default function BerandaPage() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const router = useRouter();
  const ready = useGuard(IDLE);
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  const [choice, setChoice] = useState<Choice>("siapkan");
  const [sheet, setSheet] = useState(false);
  const [amount, setAmount] = useState(50000);

  if (!ready || !state) return null;
  const b = content.balance;
  const left = b.preOpenMinutes - state.preOpenUsed;
  const canPrepare = left >= b.prepareMinutes;
  const canExchange = left >= b.exchangeMinutes;
  const effective: Choice = canPrepare ? choice : "tidur";
  const holds = (a: number) => (a === 150000 ? (state.drawer[100000] ?? 0) >= 1 && (state.drawer[50000] ?? 0) >= 1 : (state.drawer[a] ?? 0) >= 1);
  const fee = Math.round((amount * b.exchangeFeeBp) / 10000);
  const mix = exchangeBreakdown(amount - fee);
  const usedPct = (state.preOpenUsed / b.preOpenMinutes) * 100;

  const options: Array<{ id: Choice | "tukar" | "ojol"; disabled?: boolean; tag?: string }> = [
    { id: "siapkan", disabled: !canPrepare, tag: canPrepare ? t("home.recommended") : undefined },
    { id: "tukar", disabled: !canExchange },
    { id: "ojol", disabled: true, tag: t("home.soon") },
    { id: "tidur" },
  ];

  return (
    <>
      <TopBar />
      <WarungNav />
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
        <MorningReport />
        <Card>
          <div className="flex items-center gap-3 p-3">
            <div className="flex-1 leading-tight">
              <div className="font-mono text-[11px] text-muted">{t("home.eyebrow", { weekday: t(`weekday.${state.day % 7}`), n: state.day + 1 })}</div>
              <b className="font-display text-xl">{t("home.title")}</b>
              <div className="text-xs text-muted">{t("home.hours")}</div>
            </div>
            <span className="w-16">
              <Art id="tanda-tutup" />
            </span>
          </div>
          <div className="border-t border-line p-3">
            <div className="flex h-2 gap-px overflow-hidden rounded-full" role="img" aria-label={t("home.dayShape")}>
              <span className="bg-warn" style={{ width: "10.5%" }} />
              <span className="bg-accent opacity-60" style={{ width: "79%" }} />
              <span className="bg-line" style={{ width: "10.5%" }} />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
              <span>05 {t("home.shapePre")}</span>
              <span>07 {t("home.shapeOpen")}</span>
              <span>22 {t("home.shapeFree")}</span>
            </div>
          </div>
          <div className="border-t border-line p-3">
            <MoodMeters />
          </div>
        </Card>

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">{t("home.preOpen")}</h2>
            <span className="font-mono text-xs text-muted" data-testid="pre-open-left">
              {t("home.timeLeft", { left, total: b.preOpenMinutes })}
            </span>
          </div>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-warn" style={{ width: `${usedPct}%` }} />
          </div>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("home.preOpen")}>
            {options.map((o) => {
              const selected = o.id === effective;
              const isTukar = o.id === "tukar";
              return (
                <button
                  key={o.id}
                  role={isTukar ? "button" : "radio"}
                  aria-checked={isTukar ? undefined : selected}
                  disabled={o.disabled}
                  data-testid={`pre-${o.id}`}
                  onClick={() => {
                    if (isTukar) setSheet(true);
                    else setChoice(o.id as Choice);
                  }}
                  className={`flex items-center gap-3 rounded-xl border bg-panel p-3 text-left disabled:opacity-50 ${selected ? "border-accent ring-2 ring-accent/40" : "border-line"}`}
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-accent" : "border-line"}`}>
                    {selected && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <b className="text-sm">{t(`home.options.${o.id}.name`)}</b>{" "}
                    {o.tag && <span className="rounded-full bg-good/15 px-2 py-0.5 text-[10px] font-bold text-good">{o.tag}</span>}
                    <span className="block text-xs text-muted">{t(`home.options.${o.id}.desc`)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <Card className="flex items-center gap-3 p-3" data-testid="display-card">
          <span className="min-w-0 flex-1 leading-tight">
            <b className="text-sm">{t("home.displayTitle")}</b>
            <span className="block text-xs text-muted">
              {content.items.filter((i) => i.batch).map((i) => `${loc(i.name)} ${displayPortions(state, i.id)}`).join(" · ")}
            </span>
          </span>
          <Link href="/dapur" className="rounded-xl border-2 border-ink px-3 py-2 text-xs font-bold" data-testid="to-kitchen">
            {t("home.toKitchen")}
          </Link>
        </Card>

        <Card className="p-3 text-xs text-muted">{t("home.hint")}</Card>
      </div>

      <div className="flex shrink-0 gap-2 border-t border-line bg-bg px-3 py-2">
        <Button
          className="flex-1"
          data-testid="open-warung"
          onClick={() => {
            const r = send({ type: "open", prepared: effective === "siapkan" });
            if (r.ok) router.push("/kasir");
          }}
        >
          {t("home.open")}
        </Button>
      </div>

      {sheet && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/50" role="dialog" aria-modal="true" aria-label={t("exchange.title")}>
          <div className="pop flex w-full flex-col gap-3 rounded-t-2xl border-t-2 border-ink bg-panel p-4 pb-6">
            <div className="flex items-center justify-between">
              <b className="font-display text-xl">{t("exchange.title")}</b>
              <button onClick={() => setSheet(false)} aria-label={t("exchange.cancel")} className="rounded-lg border border-line px-2 py-1 text-sm font-bold">
                ×
              </button>
            </div>
            <p className="text-xs text-muted">{t("exchange.help", { minutes: b.exchangeMinutes, fee: b.exchangeFeeBp / 100 })}</p>
            <div className="flex gap-1.5">
              {AMOUNTS.map((a) => (
                <Chip key={a} on={amount === a} disabled={!holds(a)} onClick={() => setAmount(a)} className="disabled:opacity-40">
                  {rp(a)}
                </Chip>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1.5" aria-label={t("exchange.mix")}>
              {DENOMS.filter((d) => mix[d]).map((d) => (
                <div key={d} className="relative rounded-lg bg-bg p-1">
                  <span className={`block ${d >= 1000 ? "w-full" : "mx-auto w-9"}`}>
                    <Art id={pieceArt(d)} />
                  </span>
                  <span className="absolute right-1 top-1 rounded-full bg-panel px-1 font-mono text-[10px] font-bold">{mix[d]}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">{t("exchange.fee", { pct: b.exchangeFeeBp / 100 })}</span>
              <b className="font-mono">{rp(fee)}</b>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">{t("exchange.received")}</span>
              <b className="font-mono">{rp(amount - fee)}</b>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setSheet(false)}>
                {t("exchange.cancel")}
              </Button>
              <Button
                className="flex-1"
                data-testid="do-exchange"
                disabled={!holds(amount) || !canExchange}
                onClick={() => {
                  const r = send({ type: "exchangeCash", amount });
                  if (r.ok) setSheet(false);
                }}
              >
                {t("exchange.confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
