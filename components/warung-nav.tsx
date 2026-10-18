"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { chipClass } from "@/components/ui";
import { useGame } from "@/lib/game-store";

/** The warung's own screens: today's start, the counter, the menu and the storeroom. */
export function WarungNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const phase = useGame((s) => s.state?.phase ?? "idle");
  const today = phase === "open" ? "/kasir" : phase === "dayoff" ? "/libur" : "/beranda";
  const links = [
    { href: today, label: phase === "open" ? t("nav.counter") : t("nav.today"), match: ["/beranda", "/kasir", "/libur"] },
    { href: "/dapur", label: t("nav.kitchen"), match: ["/dapur"] },
    { href: "/menu", label: t("nav.menu"), match: ["/menu"] },
    { href: "/gudang", label: t("nav.storage"), match: ["/gudang"] },
    { href: "/titipan", label: t("nav.titipan"), match: ["/titipan"] },
  ];
  return (
    <nav className="scroll-thin flex shrink-0 gap-1.5 overflow-x-auto border-b border-line bg-panel px-3 py-1.5" aria-label={t("nav.label")}>
      {links.map((l) => {
        const on = l.match.some((m) => pathname.startsWith(m));
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined} className={chipClass(on)}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
