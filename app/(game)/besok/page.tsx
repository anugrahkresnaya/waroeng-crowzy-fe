"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { Button, Card } from "@/components/ui";
import { useGame } from "@/lib/game-store";
import { HOME, useGuard } from "@/lib/use-guard";

const BED: ["bed"] = ["bed"];

/** The nightly question before sleep: open tomorrow, or take the day off. */
export default function BesokPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const ready = useGuard(BED);
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);

  const sundayUnplanned = !!state && state.day % 7 === 6 && !state.planConfirmed;
  useEffect(() => {
    if (ready && sundayUnplanned) router.replace("/jadwal");
  }, [ready, sundayUnplanned, router]);

  if (!ready || !state || sundayUnplanned) return null;
  const tomorrow = (state.day + 1) % 7;
  const plannedWork = state.workDays[tomorrow];
  // The answer lives in the game, so it survives a look at the planner and back.
  const open = state.tomorrowOpen ?? plannedWork;
  const note = open
    ? plannedWork
      ? t("tomorrow.openPlanned")
      : t("tomorrow.openOnDayOff")
    : plannedWork
      ? t("tomorrow.closedUnplanned")
      : t("tomorrow.closedPlanned");
  const warn = !open && plannedWork;
  const short = (i: number) => t(`weekdayShort.${i}`);

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
      <div className="px-1 pt-1">
        <div className="font-mono text-xs text-muted">{t("tomorrow.eyebrow")}</div>
        <h1 className="font-display text-2xl font-bold leading-tight">{t("tomorrow.title")}</h1>
      </div>
      <Card className="flex flex-col items-center gap-3 p-5 text-center">
        <span className="w-24">
          <Art id={open ? "tanda-buka" : "tanda-tutup"} />
        </span>
        <div>
          <div className="font-display text-2xl font-bold">{t(`weekday.${tomorrow}`)}</div>
          <div className="text-xs text-muted">{t("tomorrow.plan", { plan: plannedWork ? t("tomorrow.work") : t("tomorrow.off") })}</div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant={open ? "primary" : "ghost"} aria-pressed={open} data-testid="tomorrow-open" onClick={() => send({ type: "decideTomorrow", open: true })}>
            {t("tomorrow.open")}
          </Button>
          <Button variant={!open ? "primary" : "ghost"} aria-pressed={!open} data-testid="tomorrow-off" onClick={() => send({ type: "decideTomorrow", open: false })}>
            {t("tomorrow.dayOff")}
          </Button>
        </div>
        <p className={`text-xs ${warn ? "text-warn" : "text-muted"}`} data-testid="tomorrow-note">
          {note}
        </p>
      </Card>

      <Card className="p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px]" aria-label={t("planner.week")}>
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className={`rounded-md py-1.5 ${i === tomorrow ? "bg-accent font-bold text-accent-fg" : state.workDays[i] ? "bg-bg" : "bg-warn/15 text-warn"}`}
            >
              {short(i)}
              <div className="font-bold">{state.workDays[i] ? t("planner.k") : t("planner.l")}</div>
            </div>
          ))}
        </div>
        <Link href="/jadwal" className="mt-2 block text-center text-xs font-bold text-accent underline">
          {t("tomorrow.seePlan")}
        </Link>
      </Card>

      <Button
        className="mt-auto"
        data-testid="go-to-bed"
        onClick={() => {
          const r = send({ type: "nextDay" });
          if (r.ok) router.push(HOME[useGame.getState().state?.phase ?? "idle"]);
        }}
      >
        {t("tomorrow.sleep")}
      </Button>
    </div>
  );
}
