"use client";

import { useEffect, type ReactNode } from "react";
import "@/lib/i18n";
import { installAutosave } from "@/lib/autosave";
import { useSettings } from "@/lib/settings-store";

/** Starts i18n and restores the saved language and theme once the page is on screen. */
export function Providers({ children }: { children: ReactNode }) {
  const hydrate = useSettings((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  useEffect(() => installAutosave(), []);
  // Offline play: the service worker caches the whole game after the first visit (production build only).
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return children;
}
