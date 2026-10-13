import type { Game, GameState } from "@/engine";
import { useGame } from "@/lib/game-store";
import { requestPersistentStorage, writeSave } from "@/lib/save-db";

export const SAVE_DELAY_MS = 4000;

interface Deps {
  save: (game: Game) => void;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
}

interface Snapshot {
  game: Game | null;
  state: GameState | null;
}

/**
 * Decides when to write. A new game or a change of phase saves at once; ordinary
 * changes (every tick of a busy shift) are batched into one write every few seconds.
 */
export function createAutosaver({ save, schedule, cancel }: Deps) {
  let handle: unknown = null;
  let dirty = false;

  const writeNow = (game: Game | null) => {
    if (handle !== null) cancel(handle);
    handle = null;
    if (!game || !dirty) return;
    dirty = false;
    save(game);
  };

  return {
    onChange(next: Snapshot, prev: Snapshot) {
      if (!next.game || next.state === prev.state) return;
      dirty = true;
      if (next.game !== prev.game || next.state?.phase !== prev.state?.phase) {
        writeNow(next.game);
        return;
      }
      if (handle === null) {
        const game = next.game;
        handle = schedule(() => {
          handle = null;
          writeNow(game);
        }, SAVE_DELAY_MS);
      }
    },
    /** For when the tab is hidden or closing: write anything still pending. */
    flush: (game: Game | null = useGame.getState().game) => writeNow(game),
    get pending() {
      return dirty;
    },
  };
}

/** Wires the autosaver to the game store and the page lifecycle. Returns an undo function. */
export function installAutosave(): () => void {
  const saver = createAutosaver({
    save: (game) => {
      void writeSave(game);
      requestPersistentStorage();
    },
    schedule: (fn, ms) => setTimeout(fn, ms),
    cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  const unsubscribe = useGame.subscribe((next, prev) => saver.onChange(next, prev));
  const onHide = () => {
    if (document.visibilityState === "hidden" && saver.pending) saver.flush();
  };
  const onPageHide = () => {
    if (saver.pending) saver.flush();
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onPageHide);
  };
}
