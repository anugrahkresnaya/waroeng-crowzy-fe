"use client";

import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { Card } from "@/components/ui";

const APPS = ["chat", "bank", "ojol", "pasar", "jadwal", "buku-kas", "layanan", "berita"] as const;

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
        {APPS.map((app) => (
          <div key={app} className="flex flex-col items-center gap-1 opacity-60">
            <span className="block w-12">
              <Art id={`ikon-app-${app}`} />
            </span>
            <span className="text-[10px] font-bold">{t(`phone.apps.${app}`)}</span>
          </div>
        ))}
      </div>
      <Card className="p-3 text-xs text-muted">{t("phone.soon")}</Card>
    </div>
  );
}
