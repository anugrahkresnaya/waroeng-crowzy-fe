"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Button, Card, Chip } from "@/components/ui";
import { content, formatClock } from "@/engine";
import { useGame } from "@/lib/game-store";
import { HOME, useGuard } from "@/lib/use-guard";
import { useLocalize } from "@/lib/use-localize";

const NOT_OPEN: ["idle", "dayoff", "ended", "night", "bed"] = ["idle", "dayoff", "ended", "night", "bed"];

/** The weekly planner: which days are days off, and what each day-off block holds. */
export default function JadwalPage() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const router = useRouter();
  const ready = useGuard(NOT_OPEN);
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  if (!ready || !state) return null;

  const max = content.balance.maxDaysOff;
  const off = state.workDays.filter((w) => !w).length;
  const askingPlan = state.phase === "bed" && state.day % 7 === 6 && !state.planConfirmed;

  const toggleActivity = (block: string, id: string) => {
    const cur = state.offPlan[block] ?? [];
    const next = cur.includes(id)
      ? cur.filter((x) => x !== id)
      : content.activityById[id].kind === "heavy"
        ? [id]
        : [...cur, id];
    send({ type: "setBlock", block, activities: next });
  };

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
      <div className="px-1 pt-1">
        <div className="font-mono text-xs text-muted">{askingPlan ? t("planner.sunday") : t("planner.eyebrow")}</div>
        <h1 className="font-display text-2xl font-bold leading-tight">{t("planner.title")}</h1>
      </div>

      <section aria-labelledby="week-h" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 id="week-h" className="font-display text-lg font-bold">
            {t("planner.week")}
          </h2>
          <span className={`font-mono text-xs ${off >= max ? "text-warn" : "text-muted"}`} data-testid="days-off">
            {t("planner.offCount", { n: off, max })}
          </span>
        </div>
        <Card className="p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
            {Array.from({ length: 7 }, (_, i) => {
              const work = state.workDays[i];
              return (
                <button
                  key={i}
                  data-testid={`day-${i}`}
                  aria-pressed={!work}
                  aria-label={`${t(`weekday.${i}`)}: ${work ? t("planner.work") : t("planner.off")}`}
                  onClick={() => send({ type: "setPlan", day: i, work: !work })}
                  className={`flex flex-col items-center rounded-md py-1.5 ${work ? "bg-bg" : "bg-warn/15 text-warn"}`}
                >
                  {t(`weekdayShort.${i}`)}
                  <b className="text-sm">{work ? t("planner.work") : t("planner.off")}</b>
                </button>
              );
            })}
          </div>
          <p className="mt-2 border-t border-line pt-2 text-[11px] text-muted">{t("planner.rule", { max })}</p>
        </Card>
      </section>

      <section aria-labelledby="blocks-h" className="flex flex-col gap-2">
        <h2 id="blocks-h" className="font-display text-lg font-bold">
          {t("planner.blocks")}
        </h2>
        {content.balance.offBlocks.map((b) => {
          const plan = state.offPlan[b.id] ?? [];
          const heavy = plan.some((id) => content.activityById[id].kind === "heavy");
          return (
            <Card key={b.id} className="p-3" >
              <div className="mb-1.5 flex items-center justify-between">
                <b className="text-sm" data-testid={`planner-${b.id}`}>
                  {t(`block.${b.id}`)}{" "}
                  <span className="font-mono text-[11px] font-normal text-muted">
                    {formatClock(b.start)}–{formatClock(b.end)}
                  </span>
                </b>
                <span className="font-mono text-[10px] text-muted">{heavy ? t("planner.heavyUsed") : t("planner.lightUsed", { n: plan.length })}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {content.activities.dayOff.map((a) => (
                  <Chip
                    key={a.id}
                    on={plan.includes(a.id)}
                    disabled={!a.available}
                    onClick={() => toggleActivity(b.id, a.id)}
                    data-testid={`act-${b.id}-${a.id}`}
                    className={`${a.kind === "heavy" ? "border-dashed" : ""} disabled:opacity-40`}
                  >
                    {loc(a.name)}
                    {!a.available ? ` · ${t("planner.soon")}` : ""}
                  </Chip>
                ))}
              </div>
            </Card>
          );
        })}
        <p className="text-[11px] text-muted">{t("planner.blockHint")}</p>
      </section>

      {askingPlan ? (
        <Button
          data-testid="confirm-plan"
          className="mt-auto"
          onClick={() => {
            const r = send({ type: "confirmPlan" });
            if (r.ok) router.push("/besok");
          }}
        >
          {t("planner.save")}
        </Button>
      ) : (
        <Link href={HOME[state.phase]} className="mt-auto rounded-xl border border-line bg-panel px-4 py-3 text-center text-sm font-bold">
          {t("planner.back")}
        </Link>
      )}
    </div>
  );
}
