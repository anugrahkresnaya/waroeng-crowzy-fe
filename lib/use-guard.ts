"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Phase } from "@/engine";
import { useGame } from "@/lib/game-store";

const HOME: Record<Phase, string> = {
  idle: "/beranda",
  dayoff: "/libur",
  open: "/kasir",
  ended: "/ringkasan",
  night: "/malam",
  bed: "/besok",
};

/**
 * Keeps a route consistent with the game: no game goes back to the title,
 * and a game in another phase is sent to that phase's screen.
 * Returns true once the screen may render.
 */
export function useGuard(allowed: Phase[]): boolean {
  const router = useRouter();
  const phase = useGame((s) => s.state?.phase ?? null);
  const ok = phase !== null && allowed.includes(phase);

  useEffect(() => {
    if (phase === null) router.replace("/");
    else if (!allowed.includes(phase)) router.replace(HOME[phase]);
  }, [phase, allowed, router]);

  return ok;
}

export { HOME };
