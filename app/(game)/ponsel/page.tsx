"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { Button, Card } from "@/components/ui";
import { PhoneStatus } from "@/components/phone-status";
import { content, phoneAlive, powerOff, signalOf } from "@/engine";
import { rp } from "@/lib/format";
import { useGame } from "@/lib/game-store";

const APPS = [
  { id: "chat", href: null },
  { id: "bank", href: "/bank" },
  { id: "ojol", href: null },
  { id: "pasar", href: "/pasar" },
  { id: "jadwal", href: "/jadwal" },
  { id: "buku-kas", href: null },
  { id: "layanan", href: null },
  { id: "berita", href: "/berita" },
] as const;

/** Placeholder: the phone apps arrive in later phases. */
export default function PonselPage() {
  const { t } = useTranslation();
  const state = useGame((s) => s.state);
  const send = useGame((s) => s.send);
  const c = content.balance.phone;
  const p = state?.phone;
  const signal = state ? signalOf(state, content) : "good";
  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-muted">{t("phone.eyebrow")}</div>
          <h1 className="font-display text-2xl font-bold">{t("phone.title")}</h1>
        </div>
        <PhoneStatus />
      </div>
      <div className="grid grid-cols-4 gap-x-2 gap-y-4">
        {APPS.map((app) => {
          const icon = (
            <>
              <span className="block w-12">
                <Art id={`ikon-app-${app.id}`} />
              </span>
              <span className="text-[10px] font-bold">{t(`phone.apps.${app.id}`)}</span>
            </>
          );
          return app.href ? (
            <Link key={app.id} href={app.href} data-testid={`app-${app.id}`} className="flex flex-col items-center gap-1">
              {icon}
            </Link>
          ) : (
            <div key={app.id} className="flex flex-col items-center gap-1 opacity-50" aria-disabled="true">
              {icon}
            </div>
          );
        })}
      </div>
      {state && p && (
        <Card className="flex flex-col gap-2 p-3 text-xs" data-testid="phone-card">
          <b className="font-display text-base">{t("phone.statusTitle")}</b>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted">
            <li data-testid="phone-signal">{t(`phone.signal.${signal}`)}</li>
            <li data-testid="phone-battery" className={phoneAlive(state) ? "" : "font-bold text-bad"}>
              {t("phone.battery", { pct: Math.round(p.battery) })}
              {!powerOff(state) && p.battery < 100 ? ` · ${t("phone.charging")}` : ""}
            </li>
            <li data-testid="phone-data" className={p.data <= 0 ? "font-bold text-bad" : ""}>
              {t("phone.data", { mb: Math.round(p.data) })}
            </li>
            <li>{p.powerbank === null ? t("phone.noPowerbank") : t("phone.powerbank", { pct: Math.round(p.powerbank) })}</li>
          </ul>
          <p className="text-[11px] text-muted">{t("phone.help")}</p>
          <div className="flex gap-2">
            {c.dataPacks.map((pack, i) => (
              <Button key={pack.mb} variant="ghost" className="flex-1 px-2! py-2 text-xs!" data-testid={`buy-data-${i}`} onClick={() => send({ type: "buyData", pack: i })}>
                {t("phone.buyData", { mb: pack.mb, price: rp(pack.price) })}
              </Button>
            ))}
          </div>
          {p.powerbank === null && (
            <Button variant="soft" className="py-2 text-xs!" disabled={state.bank < c.powerbank.price} data-testid="buy-powerbank" onClick={() => send({ type: "buyPowerbank" })}>
              {t("phone.buyPowerbank", { price: rp(c.powerbank.price) })}
            </Button>
          )}
        </Card>
      )}
      <Card className="p-3 text-xs text-muted">{t("phone.soon")}</Card>
    </div>
  );
}
