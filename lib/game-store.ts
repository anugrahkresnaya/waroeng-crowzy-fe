import { create } from "zustand";
import {
  Game,
  content,
  type Command,
  type CommandResult,
  type GameEvent,
  type GameState,
} from "@/engine";
import { rp } from "@/lib/format";

export type ToastTone = "good" | "bad" | "info";

export interface Toast {
  id: number;
  /** Translation key under "toast.". */
  key: string;
  vars?: Record<string, string | number>;
  tone: ToastTone;
}

interface GameStore {
  game: Game | null;
  /** Immutable copy of the engine state, replaced after every command or step. */
  state: GameState | null;
  toast: Toast | null;
  paused: boolean;
  /** True while quiet hours are being fast-forwarded. */
  fast: boolean;
  start: (seed?: number) => void;
  send: (command: Command) => CommandResult;
  /** Advances the open warung by one real second (normal speed, or fast in quiet hours). */
  step: () => void;
  setPaused: (paused: boolean) => void;
}

let toastId = 0;

function toastFor(event: GameEvent): Omit<Toast, "id"> | null {
  switch (event.type) {
    case "sale":
      return { key: `sale.${event.mood}`, vars: { amount: rp(event.bill) }, tone: event.mood === "annoyed" ? "bad" : "good" };
    case "walkaway":
      return event.reason === "closing" ? null : { key: `walkaway.${event.reason}`, tone: "bad" };
    case "order_mismatch":
      return { key: "orderMismatch", tone: "bad" };
    case "short_change_caught":
      return { key: "shortChangeCaught", tone: "bad" };
    case "underage_sale":
      return { key: "underageSale", tone: "bad" };
    case "turned_away":
      return { key: "turnedAway", tone: "bad" };
    case "exchanged":
      return { key: "exchanged", vars: { amount: rp(event.amount), fee: rp(event.fee) }, tone: "good" };
    case "shelves_ready":
      return { key: "shelvesReady", tone: "info" };
    case "new_day":
      return { key: "newDay", vars: { day: event.day + 1 }, tone: "info" };
    default:
      return null;
  }
}

/** The last event in a batch that deserves a toast, so a busy tick does not flood the screen. */
function pickToast(events: GameEvent[]): Toast | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const t = toastFor(events[i]);
    if (t) return { ...t, id: ++toastId };
  }
  return null;
}

export const useGame = create<GameStore>((set, get) => ({
  game: null,
  state: null,
  toast: null,
  paused: false,
  fast: false,

  start: (seed = Math.floor(Math.random() * 2 ** 31)) => {
    const game = new Game(content, { seed });
    set({ game, state: game.snapshot(), toast: null, paused: false, fast: false });
  },

  send: (command) => {
    const { game } = get();
    if (!game) return { ok: false, error: "wrong_phase" };
    const result = game.dispatch(command);
    if (result.ok) {
      set({ state: game.snapshot(), toast: pickToast(result.events) ?? get().toast });
    } else {
      set({ toast: { id: ++toastId, key: `error.${result.error}`, tone: "bad" } });
    }
    return result;
  },

  step: () => {
    const { game, paused } = get();
    if (!game || paused || game.state.phase !== "open") return;
    const fast = game.canFastForward();
    const events: GameEvent[] = [];
    for (let i = 0; i < (fast ? 12 : 2); i++) {
      events.push(...game.tick());
      if (game.state.phase !== "open") break;
      if (fast && game.state.line.length > 0) break;
    }
    set({ state: game.snapshot(), fast: game.canFastForward(), toast: pickToast(events) ?? get().toast });
  },

  setPaused: (paused) => set({ paused }),
}));

// Test hook: lets browser tests read the game and drive it between UI steps (never in production).
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __warung?: unknown }).__warung = { store: useGame, content };
}
