import { create } from "zustand";
import {
  Game,
  content,
  formatClock,
  restoreGame,
  type Command,
  type CommandResult,
  type GameEvent,
  type GameState,
} from "@/engine";
import { rp } from "@/lib/format";
import i18n from "@/lib/i18n";
import { readSave } from "@/lib/save-db";

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
  /** Loads the saved game, paused so a mid-shift resume does not run away. */
  resume: () => Promise<"ok" | "none" | "invalid" | "newer" | "outdated" | "unavailable">;
  send: (command: Command) => CommandResult;
  /** Advances the open warung by one real second (normal speed, or fast in quiet hours). */
  step: () => void;
  setPaused: (paused: boolean) => void;
}

let toastId = 0;

const billName = (id: string) => content.balance.bills.find((b) => b.id === id)?.name[i18n.language === "en" ? "en" : "id"] ?? id;
const itemName = (id: string) => content.itemById[id]?.name[i18n.language === "en" ? "en" : "id"] ?? id;

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
    case "order_placed":
      return { key: "orderPlaced", vars: { total: rp(event.total) }, tone: "good" };
    case "order_delivered":
      return { key: "orderDelivered", tone: "good" };
    case "order_late":
      return { key: "orderLate", tone: "bad" };
    case "pasar_bought":
      return { key: "pasarBought", vars: { total: rp(event.total) }, tone: "good" };
    case "spoiled":
      return { key: "spoiled", vars: { value: rp(event.value) }, tone: "bad" };
    case "cooked":
      return { key: "cooked", vars: { item: itemName(event.item), portions: event.portions }, tone: "good" };
    case "went_stale":
      return { key: "wentStale", vars: { item: itemName(event.item), portions: event.portions }, tone: "bad" };
    case "plated":
      return { key: `plated.${event.quality}`, vars: { item: itemName(event.item) }, tone: event.quality === "pas" ? "good" : event.quality === "biasa" ? "info" : "bad" };
    case "outage_notice":
      return { key: "outageNotice", vars: { from: formatClock(event.from), until: formatClock(Math.min(1440, event.from + event.hours * 60)) }, tone: "bad" };
    case "power_out":
      return { key: "powerOut", tone: "bad" };
    case "power_back":
      return { key: "powerBack", tone: "good" };
    case "ice_bought":
      return { key: "iceBought", vars: { price: rp(event.price) }, tone: "good" };
    case "lantern_bought":
      return { key: "lanternBought", vars: { price: rp(event.price) }, tone: "good" };
    case "generator_bought":
      return { key: "generatorBought", vars: { price: rp(event.price) }, tone: "good" };
    case "generator_fuel":
      return { key: "generatorFuel", vars: { hours: event.hours, cost: rp(event.cost) }, tone: "info" };
    case "stock_sold_off":
      return { key: "stockSoldOff", vars: { money: rp(event.money) }, tone: "good" };
    case "token_low":
      return { key: "tokenLow", vars: { token: rp(event.token) }, tone: "bad" };
    case "token_out":
      return { key: "tokenOut", tone: "bad" };
    case "token_bought":
      return { key: "tokenBought", vars: { amount: rp(event.amount), fee: rp(event.fee) }, tone: "good" };
    case "bill_notice": {
      const n = event.inDays;
      const when = n <= 0 ? i18n.t("toast.when.today") : n === 1 ? i18n.t("toast.when.tomorrow") : i18n.t("toast.when.soon", { n });
      return { key: "billNotice", vars: { bill: billName(event.id), when }, tone: "info" };
    }
    case "bill_paid":
      return { key: "billPaid", vars: { bill: billName(event.id), total: rp(event.total) }, tone: "good" };
    case "bill_overdue":
      return { key: "billOverdue", vars: { bill: billName(event.id) }, tone: "bad" };
    case "qris_trusted":
      return { key: "qrisTrusted", tone: "info" };
    case "qris_settled":
      return event.lost > 0
        ? { key: "qrisSettled", vars: { received: rp(event.received), lost: rp(event.lost) }, tone: "bad" }
        : { key: "qrisSettledOk", vars: { received: rp(event.received) }, tone: "good" };
    case "phone_low":
      return { key: "phoneLow", vars: { battery: event.battery }, tone: "bad" };
    case "data_low":
      return { key: "dataLow", vars: { mb: event.mb }, tone: "bad" };
    case "data_bought":
      return { key: "dataBought", vars: { mb: event.mb, price: rp(event.price) }, tone: "good" };
    case "powerbank_bought":
      return { key: "powerbankBought", vars: { price: rp(event.price) }, tone: "good" };
    case "titipan_taken":
      return { key: "titipanTaken", vars: { qty: event.qty, item: itemName(event.item) }, tone: "info" };
    case "titipan_settled":
      return { key: "titipanSettled", vars: { sold: event.sold, returned: event.returned, paid: rp(event.paid) }, tone: event.owed > 0 ? "bad" : "good" };
    case "titipan_paid":
      return { key: "titipanPaid", vars: { amount: rp(event.amount) }, tone: "good" };
    case "freezer_bought":
      return { key: "freezerBought", vars: { price: rp(event.price) }, tone: "good" };
    case "fridge_bought":
      return { key: "fridgeBought", vars: { price: rp(event.price) }, tone: "good" };
    case "frozen_lost":
      return { key: "frozenLost", vars: { item: itemName(event.item), pieces: event.pieces }, tone: "bad" };
    case "gas_bought":
      return { key: "gasBought", vars: { price: rp(event.price) }, tone: "good" };
    case "burner_wasted":
      return { key: "burnerWasted", vars: { item: itemName(event.item) }, tone: "bad" };
    case "season_notice":
      return { key: `season.${event.id}.${event.inDays === 0 ? "now" : "soon"}`, vars: { n: event.inDays }, tone: "info" };
    case "news":
      return { key: `news.${event.event}`, tone: "info" };
    case "shelves_ready":
      return { key: "shelvesReady", tone: "info" };
    case "block_done": {
      const extra = event.cash === 0 ? "" : ` · ${event.cash > 0 ? "+" : ""}${rp(event.cash)}`;
      return { key: `blockDone.${event.block}`, vars: { extra }, tone: "good" };
    }
    case "unplanned_closure":
      return { key: "unplannedClosure", tone: "bad" };
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

  resume: async () => {
    try {
      const saved = await readSave();
      if (!saved) return "none";
      if (!saved.ok) return saved.reason;
      const game = restoreGame(content, saved.save);
      set({ game, state: game.snapshot(), toast: null, paused: true, fast: false });
      return "ok";
    } catch {
      return "unavailable";
    }
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
