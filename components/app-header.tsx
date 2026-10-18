"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Art } from "@/components/art";
import { PhoneStatus } from "@/components/phone-status";

/** The top of a phone app: back to the phone, the app's icon and name. */
export function AppHeader({ title, icon, back = "/ponsel", right }: { title: string; icon: string; back?: string; right?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-3 py-2">
      <Link href={back} aria-label={t("back")} className="rounded-lg border border-line px-2 py-1 text-sm font-bold">
        ‹
      </Link>
      <span className="w-7">
        <Art id={icon} />
      </span>
      <h1 className="font-display text-lg font-bold">{title}</h1>
      <span className="ml-auto flex items-center gap-2 text-xs">
        {right}
        <PhoneStatus />
      </span>
    </header>
  );
}
