"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCounterUi } from "@/lib/counter-ui-store";
import { useGame } from "@/lib/game-store";
import { ChangePanel } from "./change-panel";
import { Ordering } from "./ordering";
import { KasbonPanel, QrisPanel } from "./payment-panels";

/** The lower half of the counter: shows the step the customer at the front is on. */
export function CounterPanel() {
  const { t } = useTranslation();
  const customer = useGame((s) => s.state?.line[0]);
  const shelfReady = useGame((s) => s.state?.shelfReady ?? false);
  const customerId = customer?.id;
  const clearGiven = useCounterUi((s) => s.clear);

  useEffect(() => {
    clearGiven();
  }, [customerId, clearGiven]);

  let body;
  if (!shelfReady) body = <Empty text={t("counter.shelvesNotReady")} />;
  else if (!customer) body = <Empty text={t("counter.waiting")} />;
  else if (customer.stage === "ordering") body = <Ordering customer={customer} />;
  else if (customer.stage === "change") body = <ChangePanel customer={customer} />;
  else if (customer.method === "qris") body = <QrisPanel customer={customer} />;
  else body = <KasbonPanel customer={customer} />;

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2" data-testid="panel">
      {body}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="grid h-full place-items-center p-4 text-center text-sm text-muted">{text}</div>;
}
