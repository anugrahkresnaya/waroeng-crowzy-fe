"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { MoodMeters } from "@/components/mood-meters";
import { Art } from "@/components/art";
import { TopBar } from "@/components/top-bar";
import { Button, Card, Pill } from "@/components/ui";
import { content, formatClock } from "@/engine";
import { useGame } from "@/lib/game-store";
import { useGuard } from "@/lib/use-guard";
import { useLocalize } from "@/lib/use-localize";

const DAYOFF: ["dayoff"] = ["dayoff"];

/** A day off: four blocks, each one heavy activity or up to two light ones. Time only moves when a block is run. */
export default function LiburPage() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const ready = useGuard(DAYOFF);
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  if (!ready || !state) return null;
  const blocks = content.balance.offBlocks;

  return (
    <>
      <TopBar />
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
        <Card>
          <div className="flex items-center gap-3 p-3">
            <div className="flex-1 leading-tight">
              <div className="font-mono text-[11px] text-muted">{t("off.eyebrow", { weekday: t(`weekday.${state.day % 7}`), n: state.day + 1 })}</div>
              <b className="font-display text-xl">{t("off.title")}</b>
              <div className="text-xs text-muted">{t("off.desc")}</div>
            </div>
            <span className="w-16">
              <Art id="tanda-tutup" />
            </span>
          </div>
          <div className="border-t border-line p-3">
            <MoodMeters />
          </div>
        </Card>

        <ol className="flex flex-col gap-2" aria-label={t("off.blocks")}>
          {blocks.map((b, i) => {
            const done = i < state.blockIndex;
            const current = i === state.blockIndex;
            const plan = state.offPlan[b.id] ?? [];
            return (
              <li
                key={b.id}
                data-testid={`block-${b.id}`}
                className={`rounded-xl border bg-panel p-3 ${current ? "border-accent ring-2 ring-accent/40" : "border-line"} ${i > state.blockIndex ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <b className="text-sm">
                    {t(`block.${b.id}`)}{" "}
                    <span className="font-mono text-[11px] font-normal text-muted">
                      {formatClock(b.start)}–{formatClock(b.end)}
                    </span>
                  </b>
                  {done ? <Pill tone="good">{t("off.done")}</Pill> : current ? <Pill tone="warn">{t("off.now")}</Pill> : null}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {plan.length === 0 ? (
                    <span className="text-xs text-muted">{t("off.noPlan")}</span>
                  ) : (
                    plan.map((id) => (
                      <Pill key={id} tone={content.activityById[id].kind === "heavy" ? "good" : "mute"}>
                        {loc(content.activityById[id].name)}
                      </Pill>
                    ))
                  )}
                </div>
                {current && (
                  <div className="mt-2 flex gap-2">
                    <Link href="/jadwal" className="flex-1 rounded-xl border border-line bg-panel px-4 py-2 text-center text-sm font-bold">
                      {t("off.changePlan")}
                    </Link>
                    <Button className="flex-1 py-2!" data-testid="run-block" onClick={() => send({ type: "runBlock" })}>
                      {t("off.run", { block: t(`block.${b.id}`).toLowerCase() })}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-[11px] text-muted">{t("off.hint")}</p>
      </div>
    </>
  );
}
