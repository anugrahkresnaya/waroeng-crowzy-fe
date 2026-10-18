"use client";

import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { autoMinutes, content, gasPrice, gasTanks, justRight, type Burner, type Quality } from "@/engine";
import { rp } from "@/lib/format";
import { useCounterUi } from "@/lib/counter-ui-store";
import { useGame } from "@/lib/game-store";
import { useLocalize } from "@/lib/use-localize";

/** Minutes shown past the end of the just-right window, so the burnt zone has room. */
const BURNT_ROOM = 6;

/** Below this many tanks the stove offers to buy another one. */
const LOW_GAS = 0.1;

const ZONE_TONE: Record<Exclude<Quality, "biasa">, string> = { kurang: "text-warn", pas: "text-good", gosong: "text-bad" };

/** The stove: one slot per burner with a doneness bar. Lift the dish while the marker is in the green. */
export function Stove() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  const auto = useCounterUi((s) => s.auto);
  const setAuto = useCounterUi((s) => s.setAuto);
  if (!state) return null;
  const tanks = gasTanks(state, content);
  const price = gasPrice(state, content);
  const low = tanks < LOW_GAS;
  const canBuy = state.busyUntil === 0 && state.bank >= price;

  return (
    <section className="mb-2 rounded-xl border border-line bg-panel p-2" aria-label={t("stove.title")} data-testid="stove">
      <div className="mb-1.5 flex items-center gap-2">
        <b className="font-display text-sm">{t("stove.title")}</b>
        <span className="ml-auto text-[10px] text-muted">{t("stove.mode")}</span>
        <div className="flex gap-1" role="group" aria-label={t("stove.mode")}>
          {[false, true].map((mode) => (
            <button
              key={String(mode)}
              onClick={() => setAuto(mode)}
              aria-pressed={auto === mode}
              data-testid={mode ? "cook-auto" : "cook-manual"}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${auto === mode ? "border-accent bg-accent text-accent-fg" : "border-line"}`}
            >
              {mode ? t("stove.auto") : t("stove.manual")}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {state.burners.map((burner, i) => (
          <BurnerSlot key={i} index={i} burner={burner} tick={state.tick} onLift={() => send({ type: "plate", burner: i })} state={state} loc={loc} t={t} />
        ))}
      </div>
      {state.burners.every((b) => !b) && <p className="mt-1.5 text-[11px] text-muted">{t("stove.hint")}</p>}
      <div className="mt-1.5 flex items-center gap-2" data-testid="stove-gas">
        <span className={`text-[11px] font-bold ${low ? "text-bad" : "text-muted"}`}>
          {tanks > 0 ? t("stove.gas", { tanks: (Math.round(tanks * 10) / 10).toString() }) : t("stove.gasEmpty")}
        </span>
        {low && (
          <button
            onClick={() => send({ type: "buyGas" })}
            disabled={!canBuy}
            data-testid="buy-gas-stove"
            className="ml-auto rounded-full border-2 border-ink bg-panel px-2.5 py-0.5 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("stove.buyGas", { price: rp(price), minutes: content.balance.gas.nearbyMinutes })}
          </button>
        )}
      </div>
    </section>
  );
}

function BurnerSlot({
  index, burner, tick, onLift, state, loc, t,
}: {
  index: number;
  burner: Burner | null;
  tick: number;
  onLift: () => void;
  state: NonNullable<ReturnType<typeof useGame.getState>["state"]>;
  loc: ReturnType<typeof useLocalize>;
  t: (key: string, vars?: Record<string, unknown>) => string;
}) {
  if (!burner) {
    return (
      <div className="grid min-h-[70px] place-items-center rounded-lg border border-dashed border-line text-[11px] text-muted" data-testid={`burner-${index}`}>
        {t("stove.burner", { n: index + 1 })} · {t("stove.empty")}
      </div>
    );
  }
  const item = content.itemById[burner.item];
  const elapsed = tick - burner.startedAt;
  const { from, to } = justRight(state, content, item);
  const total = (burner.auto ? autoMinutes(content, item) : to) + BURNT_ROOM;
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / total) * 100))}%`;
  const zone: Exclude<Quality, "biasa"> = elapsed < from ? "kurang" : elapsed <= to ? "pas" : "gosong";

  return (
    <div className="rounded-lg border border-line bg-bg p-1.5" data-testid={`burner-${index}`} data-zone={burner.auto ? "auto" : zone}>
      <div className="flex items-center gap-1.5">
        <span className="w-8 shrink-0">
          <Art id={item.art} />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <b className="block truncate text-[11px]">{loc(item.name)}</b>
          <span className={`block text-[10px] font-bold ${burner.auto ? "text-muted" : ZONE_TONE[zone]}`}>
            {burner.auto ? t("stove.autoCooking") : t(`stove.zone.${zone}`)}
          </span>
        </span>
      </div>
      {burner.auto ? (
        <div
          className="mt-1 h-2.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label={t("stove.burner", { n: index + 1 })}
          aria-valuemin={0}
          aria-valuemax={autoMinutes(content, item)}
          aria-valuenow={Math.min(elapsed, autoMinutes(content, item))}
        >
          <div className="h-full rounded-full bg-muted transition-[width] duration-1000 ease-linear" style={{ width: pct(elapsed) }} />
        </div>
      ) : (
        <>
          <div
            className="relative mt-1 h-2.5 overflow-hidden rounded-full"
            role="progressbar"
            aria-label={t("stove.burner", { n: index + 1 })}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Math.min(elapsed, total)}
            aria-valuetext={t(`stove.zone.${zone}`)}
          >
            <span className="absolute inset-y-0 left-0 bg-warn/40" style={{ width: pct(from) }} />
            <span className="absolute inset-y-0 bg-good" style={{ left: pct(from), width: `${((to - from) / total) * 100}%` }} />
            <span className="absolute inset-y-0 right-0 bg-bad/50" style={{ left: pct(to) }} />
            <span className="absolute inset-y-0 w-1 -translate-x-1/2 bg-ink transition-[left] duration-1000 ease-linear" style={{ left: pct(elapsed) }} />
          </div>
          <button
            onClick={onLift}
            data-testid={`lift-${index}`}
            className={`mt-1.5 w-full rounded-lg border-2 border-ink py-1 text-xs font-bold ${zone === "pas" ? "bg-good text-white" : "bg-panel"}`}
          >
            {t("stove.lift")}
          </button>
        </>
      )}
    </div>
  );
}
