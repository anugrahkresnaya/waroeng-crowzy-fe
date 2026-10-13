"use client";

import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { content, moodOf, type Customer } from "@/engine";
import { useGame } from "@/lib/game-store";
import { useLocalize } from "@/lib/use-localize";

const SLOTS = [
  { left: 5, width: 31 },
  { left: 41, width: 22 },
  { left: 63, width: 19 },
  { left: 82, width: 15 },
];

function patienceTone(c: Customer) {
  const r = c.patience / c.maxPatience;
  return r >= 0.5 ? "bg-good" : r >= 0.2 ? "bg-[#e0a73a]" : "bg-bad";
}

/** The warung front with the queue: sprites follow each customer's mood, bars show patience. */
export function Stage() {
  const { t } = useTranslation();
  const loc = useLocalize();
  const line = useGame((s) => s.state?.line ?? []);
  const front = line[0];
  return (
    <div className="shrink-0 px-3 pt-2">
      <div className="relative overflow-hidden rounded-xl border-2 border-ink bg-stage" style={{ aspectRatio: "360 / 230" }} data-testid="stage">
        <Art id="warung-depan" className="absolute inset-0 h-full! object-cover object-bottom" />
        {line.map((c, i) => {
          const slot = SLOTS[i];
          const type = content.typeById[c.type];
          return (
            <div key={c.id} className="absolute bottom-[3%]" style={{ left: `${slot.left}%`, width: `${slot.width}%` }} data-testid="customer">
              <Art id={`${type.art}-${moodOf(c)}`} />
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/30">
                <div className={`h-full rounded-full ${patienceTone(c)}`} style={{ width: `${Math.max(0, (c.patience / c.maxPatience) * 100)}%` }} />
              </div>
            </div>
          );
        })}
        {front ? (
          <div className="pop absolute left-2 top-2 z-10 max-w-[78%] rounded-2xl border-2 border-ink bg-paper px-3 py-2 text-[13px] font-medium leading-snug text-ink shadow">
            <div className="mb-0.5 font-mono text-[10px] uppercase tracking-wide opacity-60">
              {loc(content.typeById[front.type].name)}
              {front.ktpChecked ? ` · ${t("age", { n: front.age })}` : ""}
            </div>
            {front.order.map((l) => `${loc(content.itemById[l.itemId].name).toLowerCase()} ${l.qty}`).join(", ")}.
          </div>
        ) : (
          <>
            <div className="absolute left-3 top-3 w-16">
              <Art id="tanda-buka" />
            </div>
            <div className="absolute left-20 top-5 rounded-xl border-2 border-ink bg-paper px-3 py-1.5 text-xs font-medium text-ink">
              {t("noCustomer")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
