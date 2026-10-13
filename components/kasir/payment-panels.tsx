"use client";

import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { Button } from "@/components/ui";
import { content, type Customer } from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useLocalize } from "@/lib/use-localize";

export function QrisPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const send = useGame((s) => s.send);
  const bp = content.balance.qrisFeeBp;
  const fee = Math.ceil((customer.bill * bp) / 10000);
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-panel p-4 text-center">
      <div className="w-24">
        <Art id="qris-stand" />
      </div>
      <div className="text-sm text-muted">{t("qris.scan")}</div>
      <div className="font-mono text-3xl font-medium tabular-nums">{rp(customer.bill)}</div>
      <div className="text-xs text-muted">{t("qris.note", { net: rp(customer.bill - fee), fee: rp(fee) })}</div>
      <Button className="w-full" data-testid="confirm-qris" onClick={() => send({ type: "confirmQris" })}>
        {t("qris.confirm")}
      </Button>
    </div>
  );
}

export function KasbonPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const loc = useLocalize();
  const send = useGame((s) => s.send);
  const owed = useGame((s) => s.state?.kasbon.reduce((sum, k) => sum + k.amount, 0) ?? 0);
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-panel p-4 text-center">
      <div className="w-20">
        <Art id="buku-kasbon" />
      </div>
      <div className="text-sm">{t("kasbon.ask", { who: loc(content.typeById[customer.type].name) })}</div>
      <div className="font-mono text-3xl font-medium tabular-nums">{rp(customer.bill)}</div>
      <div className="text-xs text-muted">{t("kasbon.note", { owed: rp(owed) })}</div>
      <div className="flex w-full gap-2">
        <Button variant="ghost" className="flex-1" onClick={() => send({ type: "refuseKasbon" })}>
          {t("kasbon.refuse")}
        </Button>
        <Button className="flex-1" data-testid="grant-kasbon" onClick={() => send({ type: "grantKasbon" })}>
          {t("kasbon.grant")}
        </Button>
      </div>
    </div>
  );
}
