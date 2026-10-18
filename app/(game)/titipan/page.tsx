"use client";

import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { TopBar } from "@/components/top-bar";
import { Button, Card, Meter, Pill } from "@/components/ui";
import { WarungNav } from "@/components/warung-nav";
import { content, titipanBlocked, titipanCost, titipanLevel, titipanRoom, titipanUnlocked, type CommandError, type Phase } from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useGuard } from "@/lib/use-guard";
import { useLocalize } from "@/lib/use-localize";

const ANY: Phase[] = ["idle", "open", "ended", "dayoff", "night", "bed"];

/** Titipan: take goods from a neighbour before opening, pay only for what sells, and return the rest. */
export default function TitipanPage() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const ready = useGuard(ANY);
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  if (!ready || !state) return null;

  const cfg = content.balance.titipan;
  const unlocked = titipanUnlocked(state, content);
  const level = titipanLevel(state, content);
  const blocked = titipanBlocked(state, content);
  const items = content.items.filter((i) => i.consign);
  const why = (room: number): CommandError | null => blocked ?? (room <= 0 ? "titipan_full" : null);
  const trust = state.titipan.relation;
  const prev = cfg.levels[level.level - 1].relation;

  return (
    <>
      <TopBar />
      <WarungNav />
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
        <div className="px-1">
          <h1 className="font-display text-2xl font-bold leading-tight">{t("titipan.title")}</h1>
          <p className="text-xs text-muted">{t("titipan.help")}</p>
        </div>

        {!unlocked ? (
          <Card className="p-3 text-xs" data-testid="titipan-locked">
            <b>{t("titipan.locked", { day: cfg.unlockDay + 1 })}</b>
          </Card>
        ) : (
          <>
            <Card className="flex flex-col gap-2 p-3" data-testid="titipan-trust">
              <div className="flex items-baseline justify-between">
                <b className="font-display text-base">{t("titipan.trust")}</b>
                <Pill>{t("titipan.level", { n: level.level })}</Pill>
              </div>
              <Meter
                label={level.next === null ? t("titipan.trustMax") : t("titipan.trustNext", { have: trust, need: level.next })}
                pct={level.next === null ? 100 : ((trust - prev) / (level.next - prev)) * 100}
              />
              <p className="text-[11px] text-muted">
                {t("titipan.perks", { max: level.max, pct: Math.round((1 - level.costMul) * 100) })}
              </p>
              <p className="text-[11px] text-muted">{t("titipan.trustHelp")}</p>
            </Card>

            {state.titipan.owed > 0 && (
              <Card className="flex flex-col gap-2 border-bad/60! p-3" data-testid="titipan-owed">
                <b className="text-bad">{t("titipan.owed", { amount: rp(state.titipan.owed) })}</b>
                <p className="text-[11px] text-muted">{t("titipan.owedHelp")}</p>
                <Button className="py-2" disabled={state.bank < state.titipan.owed} data-testid="pay-neighbor" onClick={() => send({ type: "payNeighbor" })}>
                  {t("titipan.pay", { amount: rp(state.titipan.owed) })}
                </Button>
              </Card>
            )}

            {state.phase !== "idle" && <p className="px-1 text-xs text-muted">{t("titipan.onlyBeforeOpen")}</p>}

            <ul className="flex flex-col gap-3">
              {items.map((item) => {
                const taken = state.titipan.taken[item.id] ?? 0;
                const room = titipanRoom(state, content, item.id);
                const cost = titipanCost(state, content, item.id);
                const blockedWhy = why(room);
                return (
                  <li key={item.id}>
                    <Card className="p-3" data-testid={`titipan-${item.id}`}>
                      <div className="flex items-center gap-3">
                        <span className="w-12 shrink-0">
                          <Art id={item.art} />
                        </span>
                        <span className="min-w-0 flex-1 leading-tight">
                          <b className="text-sm">{loc(item.name)}</b>
                          <span className="block text-[11px] text-muted">{t("titipan.terms", { cost: rp(cost), price: rp(item.price), margin: rp(item.price - cost) })}</span>
                        </span>
                        <span className="text-right leading-tight">
                          <span className="block text-[10px] text-muted">{t("titipan.today")}</span>
                          <b className="font-mono text-lg tabular-nums" data-testid={`taken-${item.id}`}>
                            {taken}
                          </b>
                          <span className="text-[10px] text-muted"> / {level.max}</span>
                        </span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        {[1, 5].map((n) => (
                          <Button
                            key={n}
                            variant="ghost"
                            className="flex-1 py-2"
                            disabled={blockedWhy !== null || n > room}
                            data-testid={`take-${item.id}-${n}`}
                            onClick={() => send({ type: "takeTitipan", item: item.id, qty: n })}
                          >
                            {t("titipan.take", { n })}
                          </Button>
                        ))}
                      </div>
                      {blockedWhy && state.phase === "idle" && <p className="mt-1 text-center text-[11px] text-muted">{t(`titipan.why.${blockedWhy}`)}</p>}
                    </Card>
                  </li>
                );
              })}
            </ul>
            <p className="px-1 text-[11px] text-muted">{t("titipan.minutes", { minutes: cfg.minutes })}</p>
          </>
        )}
      </div>
    </>
  );
}
