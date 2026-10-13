"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { HOME } from "@/lib/use-guard";
import { useGame } from "@/lib/game-store";

export function TabBar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const phase = useGame((s) => s.state?.phase ?? "idle");
  const evening = phase === "ended" || phase === "night" || phase === "bed";
  const tabs = [
    { href: HOME[phase], match: ["/beranda", "/kasir", "/libur", "/menu", "/gudang"], label: t("tab.kasir"), icon: "laci-uang" },
    { href: evening ? HOME[phase] : "/ringkasan", match: ["/ringkasan", "/malam", "/besok"], label: t("tab.ringkasan"), icon: "ikon-app-buku-kas" },
    { href: "/ponsel", match: ["/ponsel", "/jadwal", "/pasar", "/bank", "/berita"], label: t("tab.ponsel"), icon: "ponsel" },
  ];
  return (
    <nav className="grid shrink-0 grid-cols-3 border-t-2 border-ink bg-panel" aria-label={t("tab.label")}>
      {tabs.map((tab) => {
        const on = tab.match.some((m) => pathname.startsWith(m));
        return (
          <Link
            key={tab.href + tab.label}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${on ? "bg-accent text-accent-fg" : ""}`}
          >
            <span className="w-7">
              <Art id={tab.icon} />
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
