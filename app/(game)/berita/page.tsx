"use client";

import { useTranslation } from "react-i18next";
import { AppHeader } from "@/components/app-header";
import { Art } from "@/components/art";
import { Card, Pill } from "@/components/ui";
import type { Phase } from "@/engine";
import { dayLabel } from "@/lib/dates";
import { useGame } from "@/lib/game-store";
import { useGuard } from "@/lib/use-guard";

const ANY: Phase[] = ["idle", "open", "ended", "dayoff", "night", "bed"];
const ART: Record<string, string> = {
  "harvest-failure": "harga-naik",
  "fuel-hike": "harga-naik",
  flood: "ikon-lonceng",
  "lpg-shortage": "harga-naik",
  "market-operation": "harga-turun",
};

/** The radio: headlines that arrive a day or two before a price moves. */
export default function BeritaPage() {
  const { t, i18n } = useTranslation();
  const ready = useGuard(ANY);
  const state = useGame((s) => s.state);
  if (!ready || !state) return null;
  const news = [...state.market.news].reverse();
  return (
    <>
      <AppHeader title={t("news.title")} icon="ikon-app-berita" />
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
        {news.length === 0 ? (
          <Card className="p-6 text-center text-xs text-muted">{t("news.none")}</Card>
        ) : (
          news.map((n) => {
            const started = n.startsOn <= state.day;
            return (
              <Card key={`${n.day}-${n.event}`} className="flex gap-3 p-3" data-testid={`news-${n.event}`}>
                <span className="w-9 shrink-0">
                  <Art id={ART[n.event] ?? "ikon-lonceng"} />
                </span>
                <div className="flex-1 leading-tight">
                  <div className="font-mono text-[10px] text-muted">{dayLabel(n.day, i18n.language)}</div>
                  <b className="text-sm">{t(`pasar.event.${n.event}`)}</b>
                  <p className="mt-0.5 text-xs text-muted">{t(`pasar.news.${n.event}`, { starts: started ? t("pasar.alreadyUnderway") : t("pasar.soon") })}</p>
                  <div className="mt-1.5">{started ? <Pill tone="bad">{t("news.underway")}</Pill> : <Pill tone="warn">{t("news.coming")}</Pill>}</div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
