"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useGame } from "@/lib/game-store";

const TONES = {
  good: "bg-good text-white",
  bad: "bg-bad text-white",
  info: "bg-ink text-paper",
} as const;

export function Toast() {
  const { t } = useTranslation();
  const toast = useGame((s) => s.toast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => useGame.setState((s) => (s.toast?.id === toast.id ? { toast: null } : s)), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      className={`pop pointer-events-none absolute bottom-[4.75rem] left-1/2 z-40 max-w-[92%] -translate-x-1/2 rounded-full px-3 py-1.5 text-center text-xs font-bold shadow-lg ${TONES[toast.tone]}`}
    >
      {t(`toast.${toast.key}`, toast.vars)}
    </div>
  );
}
