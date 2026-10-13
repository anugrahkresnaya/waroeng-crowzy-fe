"use client";

import { useEffect, type ReactNode } from "react";
import "@/lib/i18n";
import { useSettings } from "@/lib/settings-store";

/** Starts i18n and restores the saved language and theme once the page is on screen. */
export function Providers({ children }: { children: ReactNode }) {
  const hydrate = useSettings((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return children;
}
