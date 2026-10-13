"use client";

import { useTranslation } from "react-i18next";
import { Meter } from "@/components/ui";
import { useGame } from "@/lib/game-store";

/** Mood (higher is better) and hunger (higher is hungrier), optionally showing a preview of new values. */
export function MoodMeters({ mood, hunger }: { mood?: number; hunger?: number }) {
  const { t } = useTranslation();
  const state = useGame((s) => s.state);
  if (!state) return null;
  const m = mood ?? state.mood;
  const h = hunger ?? state.hunger;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Meter label={t("stat.mood")} pct={m} tone={m < 30 ? "bg-bad" : "bg-accent"} />
      <Meter label={t("stat.hunger")} pct={h} tone={h >= 70 ? "bg-bad" : "bg-warn"} />
    </div>
  );
}
