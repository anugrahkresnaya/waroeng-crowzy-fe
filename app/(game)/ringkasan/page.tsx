"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { BarChart } from "@/components/bar-chart";
import { Button, Card } from "@/components/ui";
import { DENOMS, content, portionsLeft, type Phase } from "@/engine";
import { rb, rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { HOME, useGuard } from "@/lib/use-guard";
import { useLocalize } from "@/lib/use-localize";

const ANY: Phase[] = ["idle", "open", "ended", "dayoff", "night", "bed"];
const pieceArt = (d: number) => (d >= 1000 ? `uang-${d}` : `koin-${d}`);
const SMALL = [5000, 2000, 1000, 500, 200, 100];

function Stat({ label, value, sub, tone = "" }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`font-mono text-lg font-medium tabular-nums ${tone}`}>{value}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}

export default function RingkasanPage() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const router = useRouter();
  const game = useGame((s) => s.game);
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);

  // Any phase may look at the summary page, but a reload must pick the save back up first.
  const ready = useGuard(ANY);
  if (!ready || !game || !state) return null;

  if (state.phase !== "ended") {
    const back = HOME[state.phase];
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="w-16">
            <Art id="tanda-buka" />
          </span>
          <p className="text-sm text-muted">{t("summary.notYet")}</p>
          <Button onClick={() => router.push(back)}>{t("summary.back")}</Button>
        </div>
      </div>
    );
  }

  const s = game.summary();
  const hours = s.salesByHour;
  const hourLabels = hours.map((_, i) => String(7 + i).padStart(2, "0"));
  const lowChange = SMALL.filter((d) => (state.drawer[d] ?? 0) < 3);
  const lowStock = content.items
    .map((i) => ({ item: i, left: portionsLeft(state, content, i.id) }))
    .filter((x) => x.left <= 5)
    .sort((a, b) => a.left - b.left);
  const peakHour = hours.indexOf(Math.max(...hours));
  const changeErr = s.changeErrors.overChange;

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0" data-testid="summary">
      <div className="px-1 pt-1">
        <div className="font-mono text-xs text-muted">{t("summary.eyebrow", { weekday: t(`weekday.${state.day % 7}`), n: state.day + 1 })}</div>
        <h1 className="font-display text-2xl font-bold leading-tight">{t("summary.title")}</h1>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={t("summary.gross")} value={rp(s.grossSales)} sub={t("summary.grossSub", { cash: rb(s.cashRevenue), qris: rb(s.qrisRevenue), kasbon: rb(s.kasbonCredit) })} />
        <Stat label={t("summary.served")} value={String(s.served)} sub={t("summary.servedSub", { walk: s.walkaways, turned: s.turnedAway })} />
        <div className="col-span-2">
          <Stat
            label={t("summary.profit")}
            value={rp(s.netProfit)}
            sub={t("summary.profitSub", { cost: rb(s.cogs), fees: rb(s.qrisFees) })}
            tone={s.netProfit < 0 ? "text-bad" : s.netProfit > 0 ? "text-good" : ""}
          />
        </div>
        <Stat
          label={t("summary.changeErrors")}
          value={rp(changeErr)}
          sub={t("summary.changeErrorsSub", { caught: s.changeErrors.shortCaught, kept: s.changeErrors.shortUnnoticed })}
          tone={changeErr > 0 || s.changeErrors.shortCaught > 0 ? "text-warn" : ""}
        />
        <Stat label={t("summary.reputation")} value={String(Math.round(s.reputation))} sub={t("summary.underage", { n: s.underageSales })} tone={s.underageSales > 0 ? "text-bad" : "text-good"} />
      </div>

      <Card className="p-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <b>{t("summary.perHour")}</b>
          <span className="font-mono text-muted">Rp</span>
        </div>
        <BarChart values={hours} labels={hourLabels} ariaLabel={t("summary.perHour")} format={rp} tick={(n) => (n === 0 ? "0" : rb(n))} />
        {s.grossSales > 0 && (
          <div className="mt-1 text-[11px] text-muted">{t("summary.peak", { hour: hourLabels[peakHour] })}</div>
        )}
      </Card>

      <Card className="p-3">
        <div className="mb-1 flex items-center gap-2 text-xs">
          <span className="w-6">
            <Art id="laci-uang" />
          </span>
          <b>{t("summary.drawer")}</b>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {DENOMS.map((d) => (
            <div key={d} className="relative rounded-lg bg-bg p-1">
              <span className={`block ${d >= 1000 ? "w-full" : "mx-auto w-8 py-1.5"}`}>
                <Art id={pieceArt(d)} />
              </span>
              <span className={`absolute right-1 top-1 rounded-full bg-panel px-1 font-mono text-[10px] font-bold ${SMALL.includes(d) && (state.drawer[d] ?? 0) < 3 ? "text-bad" : ""}`}>
                {state.drawer[d] ?? 0}
              </span>
            </div>
          ))}
        </div>
        {lowChange.length > 0 && (
          <div className="mt-2 text-[11px] text-bad" data-testid="low-change">
            <b>▲ {t("summary.lowChange")}</b> {t("summary.lowChangeHint")}
          </div>
        )}
      </Card>

      {lowStock.length > 0 && (
        <Card className="p-3">
          <div className="mb-1 text-xs font-bold">{t("summary.lowStock")}</div>
          <ul className="flex flex-col divide-y divide-line">
            {lowStock.map(({ item, left }) => (
              <li key={item.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                <span className="w-7">
                  <Art id={item.art} />
                </span>
                <span className="flex-1">{loc(item.name)}</span>
                <span className="font-mono text-xs font-bold tabular-nums text-bad">{t("summary.left", { n: left })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Button
        data-testid="to-night"
        onClick={() => {
          const r = send({ type: "goToNight" });
          if (r.ok) router.push("/malam");
        }}
      >
        {t("summary.toNight")}
      </Button>
    </div>
  );
}
