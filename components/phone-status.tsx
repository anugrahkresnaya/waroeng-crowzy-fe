"use client";

import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { content, powerOff, signalOf } from "@/engine";
import { useGame } from "@/lib/game-store";

const SIGNAL_BARS = { good: 4, slow: 2, down: 0 } as const;

/** Signal, battery and data as the phone's own status icons. */
export function PhoneStatus() {
  const { t } = useTranslation();
  const state = useGame((s) => s.state);
  if (!state) return null;
  const p = state.phone;
  const signal = signalOf(state, content);
  const charging = !powerOff(state) && p.battery < 100;
  const battery = charging ? "baterai-cas" : p.battery > 60 ? "baterai-penuh" : p.battery > 30 ? "baterai-sedang" : p.battery > 0 ? "baterai-rendah" : "baterai-kosong";
  const label = `${t(`phone.signal.${signal}`)} · ${t("phone.battery", { pct: Math.round(p.battery) })} · ${t("phone.data", { mb: Math.round(p.data) })}`;
  return (
    <span className="flex items-center gap-1" role="img" aria-label={label} title={label} data-testid="phone-status" data-signal={signal}>
      <span className="w-4">
        <Art id={`sinyal-${SIGNAL_BARS[signal]}`} />
      </span>
      <span className="w-4">
        <Art id={p.data > 0 ? "data-on" : "data-off"} />
      </span>
      <span className="w-5">
        <Art id={battery} />
      </span>
    </span>
  );
}
