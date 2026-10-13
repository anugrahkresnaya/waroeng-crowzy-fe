"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { Card } from "@/components/ui";

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
  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div>
        <div className="font-mono text-xs text-muted">{t("phone.eyebrow")}</div>
        <h1 className="font-display text-2xl font-bold">{t("phone.title")}</h1>
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
      <Card className="p-3 text-xs text-muted">{t("phone.soon")}</Card>
    </div>
  );
}
