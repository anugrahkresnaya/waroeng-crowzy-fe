"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { MoodMeters } from "@/components/mood-meters";
import { TopBar } from "@/components/top-bar";
import { Button, Card, Pill } from "@/components/ui";
import { content } from "@/engine";
import { rb } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useGuard } from "@/lib/use-guard";
import { useLocalize } from "@/lib/use-localize";

const NIGHT: ["night"] = ["night"];
const clamp = (n: number) => Math.min(100, Math.max(0, n));
const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** 22.00 to 24.00: light things that restore mood and hunger, 30 minutes each. */
export default function MalamPage() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const router = useRouter();
  const ready = useGuard(NIGHT);
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  const [picked, setPicked] = useState<string[]>(["makan"]);
  if (!ready || !state) return null;

  const ft = content.balance.freeTime;
  const slots = Math.floor((ft.end - ft.start) / ft.slotMinutes);
  const chosen = picked.map((id) => content.freeTimeById[id]);
  const mood = clamp(state.mood + chosen.reduce((s, a) => s + (a.effects.mood ?? 0), 0));
  const hunger = clamp(state.hunger + chosen.reduce((s, a) => s + (a.effects.hunger ?? 0), 0));
  const left = (slots - picked.length) * ft.slotMinutes;

  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < slots ? [...cur, id] : cur));

  return (
    <>
      <TopBar />
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
        <div className="px-1 pt-1">
          <div className="font-mono text-xs text-muted">{t("night.eyebrow")}</div>
          <h1 className="font-display text-2xl font-bold leading-tight">{t("night.title")}</h1>
        </div>
        <Card className="flex flex-col gap-3 p-3">
          <MoodMeters mood={mood} hunger={hunger} />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">{t("night.timeLeft")}</span>
            <b className="font-mono tabular-nums" data-testid="night-left">
              {t("night.hm", { h: Math.floor(left / 60), m: left % 60 })}
            </b>
          </div>
        </Card>

        <ul className="flex flex-col gap-2" aria-label={t("night.title")}>
          {content.activities.freeTime.map((a) => {
            const on = picked.includes(a.id);
            const e = a.effects;
            const parts = [
              t("night.minutes", { n: ft.slotMinutes }),
              e.mood ? t("night.mood", { n: signed(e.mood) }) : "",
              e.hunger ? t("night.hunger", { n: signed(e.hunger) }) : "",
              e.cost ? t("night.cost", { range: `${rb(e.cost[0])}–${rb(e.cost[1])}` }) : "",
            ].filter(Boolean);
            return (
              <li key={a.id}>
                <button
                  onClick={() => toggle(a.id)}
                  aria-pressed={on}
                  data-testid={`free-${a.id}`}
                  className={`flex w-full items-center gap-3 rounded-xl border bg-panel p-3 text-left ${on ? "border-accent ring-2 ring-accent/40" : "border-line"}`}
                >
                  <span className="w-10 shrink-0">{a.art && <Art id={a.art} />}</span>
                  <span className="flex-1 leading-tight">
                    <b className="text-sm">{loc(a.name)}</b>
                    <span className="block text-[11px] text-muted">{parts.join(" · ")}</span>
                  </span>
                  {on && <Pill tone="good">{t("night.picked")}</Pill>}
                </button>
              </li>
            );
          })}
        </ul>

        <Button
          className="mt-auto"
          data-testid="sleep"
          onClick={() => {
            const r = send({ type: "spendFreeTime", activities: picked });
            if (r.ok) router.push("/besok");
          }}
        >
          {t("night.sleep")}
        </Button>
      </div>
    </>
  );
}
