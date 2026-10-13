"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CounterPanel } from "@/components/kasir/counter-panel";
import { DragLayer } from "@/components/kasir/drag-layer";
import { OpenHoursBar } from "@/components/kasir/open-hours-bar";
import { Stage } from "@/components/kasir/stage";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui";
import { useCounterUi } from "@/lib/counter-ui-store";
import { useGame } from "@/lib/game-store";
import { useGuard } from "@/lib/use-guard";

const OPEN: ["open"] = ["open"];

function tap(kind: string, id: string) {
  const { send, state } = useGame.getState();
  const customer = state?.line[0];
  if (!state || !customer) return;
  if (kind === "item") send({ type: "pick", itemId: id });
  else if (kind === "piece" && customer.stage === "change") {
    const d = Number(id);
    const { given, addPiece } = useCounterUi.getState();
    const left = (state.drawer[d] ?? 0) + (customer.tender[d] ?? 0) - (given[d] ?? 0);
    if (left > 0) addPiece(d);
  }
}

function drop(kind: string, id: string, zone: string) {
  if ((kind === "item" && zone === "tray") || (kind === "piece" && zone === "hand")) tap(kind, id);
}

export default function KasirPage() {
  const { t } = useTranslation();
  const ready = useGuard(OPEN);
  const shelfReady = useGame((s) => s.state?.shelfReady ?? true);
  const busy = useGame((s) => (s.state?.busyUntil ?? 0) > 0);
  const send = useGame((s) => s.send);

  // One real second is two game minutes, or twelve when quiet hours are being fast-forwarded.
  useEffect(() => {
    const timer = setInterval(() => useGame.getState().step(), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!ready) return null;
  return (
    <>
      <TopBar showPause />
      <OpenHoursBar />
      {!shelfReady && (
        <div className="flex shrink-0 items-center gap-2 bg-warn/15 px-3 py-1.5 text-xs">
          <b className="text-warn">{t("counter.shelvesTitle")}</b>
          <span className="flex-1 text-muted">{busy ? t("counter.shelvesBusy") : t("counter.shelvesHint")}</span>
          <Button className="px-2! py-1! text-xs!" disabled={busy} onClick={() => send({ type: "restockShelves" })} data-testid="restock">
            {t("counter.restock")}
          </Button>
        </div>
      )}
      <Stage />
      <CounterPanel />
      <DragLayer onTap={tap} onDrop={drop} />
    </>
  );
}
