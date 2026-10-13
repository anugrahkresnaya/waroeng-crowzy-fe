"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppHeader } from "@/components/app-header";
import { Art } from "@/components/art";
import { Button, Card } from "@/components/ui";
import { total, type Phase, type Pieces } from "@/engine";
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
      </div>
    </>
  );
}
