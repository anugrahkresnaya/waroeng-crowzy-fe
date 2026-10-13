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

let resuming: ReturnType<ReturnType<typeof useGame.getState>["resume"]> | null = null;

/** One load at a time, however many screens ask. */
function resumeOnce() {
  return (resuming ??= useGame
    .getState()
    .resume()
    .finally(() => {
      resuming = null;
    }));
}

/**
 * Keeps a route consistent with the game: no game and no save goes back to the title,
 * and a game in another phase is sent to that phase's screen.
 * Returns true once the screen may render.
 */
export function useGuard(allowed: Phase[]): boolean {
  const router = useRouter();
  const phase = useGame((s) => s.state?.phase ?? null);
  const ok = phase !== null && allowed.includes(phase);

  useEffect(() => {
    if (phase !== null) {
      if (!allowed.includes(phase)) router.replace(HOME[phase]);
      return;
    }
    // A reload lands here with no game in memory: pick up the save if there is one.
    let cancelled = false;
    void resumeOnce().then((result) => {
      if (!cancelled && result !== "ok") router.replace("/");
    });
    return () => {
      cancelled = true;
    };
  }, [phase, allowed, router]);

  return ok;
}

export { HOME };
