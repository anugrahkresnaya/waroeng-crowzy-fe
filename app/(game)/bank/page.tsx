"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppHeader } from "@/components/app-header";
import { Art } from "@/components/art";
import { Button, Card, Meter } from "@/components/ui";
import { useLocalize } from "@/lib/use-localize";
import { billTotal, content, daysLate, isOverdue, payable, total, type Phase, type Pieces } from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";
import { useGuard } from "@/lib/use-guard";

const ANY: Phase[] = ["idle", "open", "ended", "dayoff", "night", "bed"];
const BIG = [100000, 50000, 20000, 10000];
const WITHDRAW = [50000, 100000, 200000];
const pieceArt = (d: number) => (d >= 1000 ? `uang-${d}` : `koin-${d}`);

/** The bank: QRIS money and what you set aside for buying stock. Move cash between the drawer and the bank. */
export default function BankPage() {
  const { t } = useTranslation();
  const ready = useGuard(ANY);
  const loc = useLocalize();
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  const [pick, setPick] = useState<Pieces>({});
  if (!ready || !state) return null;

  const picked = total(pick);
  const change = (d: number, by: number) =>
    setPick((cur) => {
      const n = Math.max(0, Math.min(state.drawer[d] ?? 0, (cur[d] ?? 0) + by));
      const next = { ...cur, [d]: n };
      if (n === 0) delete next[d];
      return next;
    });

  const tk = content.balance.token;
  const perOpenDay = tk.openPerMinute * (content.balance.closeMinute - content.balance.openMinute) + tk.perDay;
  const tokenDays = Math.floor(state.token / perOpenDay);

  return (
    <>
      <AppHeader title={t("bankApp.title")} icon="ikon-app-bank" />
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
        <div className="relative mx-auto w-[300px] max-w-full">
          <Art id="kartu-bank" />
          <div className="absolute bottom-3 right-4 text-right text-paper">
            <div className="text-[10px] opacity-80">{t("bankApp.balance")}</div>
            <div className="font-mono text-xl font-medium tabular-nums" data-testid="bank-balance">
              {rp(state.bank)}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted">{t("bankApp.help")}</p>

        <Card className="flex flex-col gap-2 p-3">
          <b className="font-display text-lg">{t("bankApp.deposit")}</b>
          <div className="grid grid-cols-4 gap-1.5">
            {BIG.map((d) => (
              <div key={d} className="flex flex-col items-center gap-1 rounded-lg bg-bg p-1.5">
                <span className="w-full">
                  <Art id={pieceArt(d)} />
                </span>
                <span className="font-mono text-[10px] text-muted">{t("bankApp.inDrawer", { n: state.drawer[d] ?? 0 })}</span>
                <span className="flex items-center gap-1">
                  <button onClick={() => change(d, -1)} className="h-5 w-5 rounded border border-line text-xs font-bold" aria-label={t("bankApp.less", { amount: rp(d) })}>
                    −
                  </button>
                  <b className="w-4 text-center font-mono text-xs" data-testid={`deposit-${d}`}>
                    {pick[d] ?? 0}
                  </b>
                  <button onClick={() => change(d, 1)} className="h-5 w-5 rounded border border-line text-xs font-bold" aria-label={t("bankApp.more", { amount: rp(d) })} data-testid={`deposit-plus-${d}`}>
                    +
                  </button>
                </span>
              </div>
            ))}
          </div>
          <Button
            disabled={picked === 0}
            data-testid="deposit"
            onClick={() => {
              const r = send({ type: "depositCash", pieces: pick });
              if (r.ok) setPick({});
            }}
          >
            {picked > 0 ? t("bankApp.depositAmount", { amount: rp(picked) }) : t("bankApp.deposit")}
          </Button>
        </Card>

        <Card className="flex flex-col gap-2 p-3">
          <b className="font-display text-lg">{t("bankApp.withdraw")}</b>
          <p className="text-[11px] text-muted">{t("bankApp.withdrawHelp")}</p>
          <div className="flex gap-2">
            {WITHDRAW.map((a) => (
              <Button key={a} variant="ghost" className="flex-1 px-2!" disabled={state.bank < a} data-testid={`withdraw-${a}`} onClick={() => send({ type: "withdrawCash", amount: a })}>
                {rp(a)}
              </Button>
            ))}
          </div>
        </Card>
        <Card className="flex flex-col gap-2 p-3" data-testid="token-card">
          <b className="font-display text-lg">{t("bankApp.token.title")}</b>
          <Meter
            label={state.token > 0 ? `${t("bankApp.token.left")}: ${rp(state.token)}` : t("bankApp.token.empty")}
            pct={(state.token / (tk.packs[tk.packs.length - 1] * 2)) * 100}
            tone={state.token < tk.lowMark ? "bg-bad" : "bg-accent"}
          />
          <p className="text-[11px] text-muted" data-testid="token-days">
            {state.token > 0 ? t("bankApp.token.days", { n: tokenDays }) : t("bankApp.token.empty")}
          </p>
          <p className="text-[11px] text-muted">{t("bankApp.token.help")}</p>
          <div className="flex gap-2">
            {tk.packs.map((a) => (
              <Button key={a} variant="ghost" className="flex-1 px-2!" disabled={state.bank < a + tk.fee} data-testid={`token-${a}`} onClick={() => send({ type: "buyToken", amount: a })}>
                {rp(a)}
              </Button>
            ))}
          </div>
          <p className="text-[10px] text-muted">{t("bankApp.token.fee", { fee: rp(tk.fee) })}</p>
        </Card>

        <Card className="flex flex-col gap-2 p-3" data-testid="bills-card">
          <b className="font-display text-lg">{t("bankApp.bills.title")}</b>
          {content.balance.bills.map((def) => {
            const late = daysLate(state, def.id);
            const overdue = isOverdue(state, content, def.id);
            const can = payable(state, content, def.id);
            const sum = billTotal(state, content, def.id);
            return (
              <div key={def.id} className="rounded-lg bg-bg p-2" data-testid={`bill-${def.id}`}>
                <div className="flex items-baseline justify-between">
                  <b className="text-sm">{loc(def.name)}</b>
                  <span className="font-mono text-sm tabular-nums">{rp(sum)}</span>
                </div>
                <p className={`text-[11px] ${late > 0 ? "font-bold text-bad" : "text-muted"}`}>
                  {late < 0 ? t("bankApp.bills.due", { n: -late }) : late === 0 ? t("bankApp.bills.dueToday") : t("bankApp.bills.late", { n: late })}
                </p>
                {overdue && <p className="text-[11px] text-bad">{t("bankApp.bills.overdue", { fee: rp(def.lateFee) })}</p>}
                {!can && <p className="text-[11px] text-muted">{t("bankApp.bills.early", { n: def.noticeDays })}</p>}
                <Button className="mt-1.5 w-full py-2" disabled={!can || state.bank < sum} data-testid={`pay-${def.id}`} onClick={() => send({ type: "payBill", id: def.id })}>
                  {t("bankApp.bills.pay", { total: rp(sum) })}
                </Button>
              </div>
            );
          })}
        </Card>
      </div>
    </>
  );
}
