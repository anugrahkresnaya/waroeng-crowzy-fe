"use client";

import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { Card } from "@/components/ui";
import { content, displayPortions, type LeftoverChoice } from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useLocalize } from "@/lib/use-localize";

const CHOICES: LeftoverChoice[] = ["obral", "eat", "give", "trash"];

/** What to do with the cooked food still on the display at night, one dish at a time. */
export function Leftovers() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  if (!state) return null;
  const left = content.items.filter((i) => i.batch && displayPortions(state, i.id) > 0);
  if (left.length === 0) return null;

  return (
    <Card className="p-3" data-testid="leftovers">
      <h2 className="font-display text-lg font-bold">{t("leftovers.title")}</h2>
      <p className="mb-2 text-xs text-muted">{t("leftovers.help")}</p>
      <ul className="flex flex-col gap-3">
        {left.map((item) => {
          const qty = displayPortions(state, item.id);
          return (
            <li key={item.id} data-testid={`leftover-${item.id}`}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="w-9 shrink-0">
                  <Art id={item.art} />
                </span>
                <b className="text-sm">{loc(item.name)}</b>
                <span className="ml-auto font-mono text-xs tabular-nums text-muted">{t("leftovers.portions", { n: qty })}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {CHOICES.map((choice) => (
                  <button
                    key={choice}
                    onClick={() => send({ type: "handleLeftover", item: item.id, choice })}
                    data-testid={`leftover-${item.id}-${choice}`}
                    className="rounded-lg border border-line px-2 py-1.5 text-left leading-tight"
                  >
                    <b className="block text-xs">{t(`leftovers.${choice}`)}</b>
                    <span className="block text-[10px] text-muted">
                      {choice === "obral" ? t("leftovers.obralHelp", { share: Math.round(content.balance.leftovers.obralMul * 100) }) : t(`leftovers.${choice}Help`)}
                    </span>
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {state.stats.waste > 0 && <p className="mt-2 text-[11px] text-bad">{t("leftovers.waste", { value: rp(Math.round(state.stats.waste)) })}</p>}
    </Card>
  );
}
