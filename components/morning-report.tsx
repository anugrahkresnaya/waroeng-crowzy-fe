"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui";
import { content, portionsLeft } from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useLocalize } from "@/lib/use-localize";

/** What the night did: deliveries that arrived or slipped, stock that spoiled, news, and what you cannot make today. */
export function MorningReport() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const state = useGame((s) => s.state);
  if (!state) return null;

  const lines: Array<{ key: string; tone: "good" | "bad" | "warn" | "info"; text: string }> = [];
  for (const o of state.orders) {
    const who = loc(content.supplierById[o.supplier].name);
    if (o.status === "delivered" && o.deliveredDay === state.day) lines.push({ key: `d${o.id}`, tone: "good", text: t("morning.delivered", { n: o.id, supplier: who }) });
    if (o.status === "transit" && o.late) lines.push({ key: `l${o.id}`, tone: "bad", text: t("morning.late", { n: o.id, supplier: who, weekday: t(`weekday.${o.arriveDay % 7}`) }) });
  }
  if (state.lastSpoiled.length > 0) {
    const value = state.lastSpoiled.reduce((s, x) => s + x.value, 0);
    const names = state.lastSpoiled.map((s) => loc(s.good ? content.itemById[s.ingredient].name : content.ingredientById[s.ingredient].name)).join(", ");
    lines.push({ key: "spoiled", tone: "bad", text: t("morning.spoiled", { names, value: rp(value) }) });
  }
  for (const n of state.market.news) {
    if (n.day !== state.day && n.startsOn !== state.day) continue;
    lines.push({ key: `n${n.day}${n.event}`, tone: "warn", text: t(`pasar.news.${n.event}`, { starts: n.startsOn <= state.day ? t("pasar.alreadyUnderway") : t("pasar.soon") }) });
  }
  const cannot = content.items.filter((i) => i.kind === "dish" && portionsLeft(state, content, i.id) === 0);
  if (cannot.length > 0) lines.push({ key: "cannot", tone: "warn", text: t("morning.cannotMake", { names: cannot.map((d) => loc(d.name)).join(", ") }) });
  if (lines.length === 0) return null;

  const color = { good: "text-good", bad: "text-bad", warn: "text-warn", info: "text-muted" };
  return (
    <Card className="flex flex-col gap-1.5 p-3" data-testid="morning-report">
      <b className="font-display text-lg">{t("morning.title")}</b>
      <ul className="flex flex-col gap-1 text-xs">
        {lines.map((l) => (
          <li key={l.key} className="flex gap-2">
            <span className={`font-bold ${color[l.tone]}`}>●</span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
      <Link href="/pasar" className="self-start text-xs font-bold text-accent underline">
        {t("morning.openMarket")}
      </Link>
    </Card>
  );
}
