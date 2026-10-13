// Save files: a validated envelope around the game state and its command log.
// `format` is the version of this envelope; `state.version` is the engine state's own version.
// To change either shape, bump the number and add a migration below.
import { z } from 'zod';
import { DENOMS } from './money';
import { Game } from './game';
import { isValidBlockPlan, type Content } from './schema';
import type { GameState } from './types';

export const SAVE_FORMAT = 1;

const num = z.number();
const pieces = z.record(z.string(), z.number().int().min(0));

const customer = z.object({
  id: num,
  type: z.string(),
  age: num,
  order: z.array(z.object({ itemId: z.string(), qty: z.number().int().positive() })),
  tray: z.record(z.string(), z.number().int().min(0)),
  patience: num,
  maxPatience: num,
  arrivedAt: num,
  stage: z.enum(['ordering', 'paying', 'change']),
  method: z.enum(['cash', 'qris', 'kasbon']),
  bill: num,
  tender: pieces,
  ktpChecked: z.boolean(),
});

const stats = z.object({
  served: num, walkaways: num, turnedAway: num, leftAtClose: num,
  itemsSold: z.record(z.string(), num),
  cashRevenue: num, qrisRevenue: num, qrisFees: num, kasbonCredit: num, kasbonRefused: num,
  wrongTrays: num, stockoutDeclines: num, underageSales: num, overChange: num,
  shortChangeCaught: num, shortChangeUnnoticed: num, shortChangeGained: num, exchangeFees: num,
  salesByHour: z.array(num),
  moods: z.object({ happy: num, neutral: num, annoyed: num }),
});

const state = z.object({
  version: z.literal(1),
  seed: num,
  rng: num,
  tick: num,
  day: z.number().int().min(0),
  minute: num,
  phase: z.enum(['idle', 'open', 'ended', 'dayoff', 'night', 'bed']),
  shelfReady: z.boolean(),
  mood: num,
  hunger: num,
  workDays: z.array(z.boolean()).length(7),
  offPlan: z.record(z.string(), z.array(z.string())),
  blockIndex: z.number().int().min(0),
  tomorrowOpen: z.boolean().nullable(),
  planConfirmed: z.boolean(),
  preOpenUsed: num,
  busyUntil: num,
  drawer: pieces,
  bank: num,
  kasbon: z.array(z.object({ customerId: num, type: z.string(), amount: num, day: num })),
  stock: z.record(z.string(), z.number().int().min(0)),
  reputation: num,
  line: z.array(customer),
  nextCustomerId: num,
  stats,
});

const logEntry = z.object({ tick: num, command: z.looseObject({ type: z.string() }) });

export const saveSchema = z.object({
  format: z.literal(SAVE_FORMAT),
  savedAt: num,
  seed: num,
  startDay: z.number().int().min(0),
  log: z.array(logEntry),
  state,
});

export type SaveData = z.infer<typeof saveSchema>;

/** Upgrades an older envelope by one format step. Add an entry when SAVE_FORMAT is bumped. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export type SaveParse =
  | { ok: true; save: SaveData }
  | { ok: false; reason: 'invalid' | 'newer' };

/** Reads whatever came out of storage. Never throws; says why when it cannot use the data. */
export function parseSave(raw: unknown): SaveParse {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'invalid' };
  let data = raw as Record<string, unknown>;
  const format = data.format;
  if (typeof format !== 'number' || !Number.isInteger(format) || format < 1) return { ok: false, reason: 'invalid' };
  if (format > SAVE_FORMAT) return { ok: false, reason: 'newer' };
  for (let f = format; f < SAVE_FORMAT; f++) {
    const step = MIGRATIONS[f];
    if (!step) return { ok: false, reason: 'invalid' };
    data = { ...step(data), format: f + 1 };
  }
  const parsed = saveSchema.safeParse(data);
  return parsed.success ? { ok: true, save: parsed.data } : { ok: false, reason: 'invalid' };
}

export function createSave(game: Game, savedAt: number): SaveData {
  return {
    format: SAVE_FORMAT,
    savedAt,
    seed: game.state.seed,
    startDay: game.startDay,
    log: structuredClone(game.log) as SaveData['log'],
    state: game.snapshot() as SaveData['state'],
  };
}

/**
 * Brings a saved state in line with the content this version ships: items, customer types,
 * day-off plans and sales buckets that no longer match are repaired instead of crashing.
 */
export function reconcile(saved: GameState, content: Content): GameState {
  const s = structuredClone(saved);
  const b = content.balance;

  const stock: Record<string, number> = {};
  for (const item of content.items) stock[item.id] = Number.isFinite(s.stock[item.id]) ? s.stock[item.id] : item.startStock;
  s.stock = stock;

  // Only remove what is not rupiah; zero counts are valid and kept so a load matches the save exactly.
  for (const key of Object.keys(s.drawer)) if (!(DENOMS as readonly number[]).includes(Number(key))) delete s.drawer[Number(key)];

  s.line = s.line.filter((c) => c.type in content.typeById && c.order.every((l) => l.itemId in content.itemById));
  for (const c of s.line) for (const id of Object.keys(c.tray)) if (!(id in content.itemById)) delete c.tray[id];

  const offPlan: GameState['offPlan'] = {};
  for (const block of b.offBlocks) {
    const plan = s.offPlan[block.id];
    offPlan[block.id] = plan && isValidBlockPlan(plan, (id) => content.activityById[id]) ? plan : [...(b.defaultOffPlan[block.id] ?? [])];
  }
  s.offPlan = offPlan;
  s.blockIndex = Math.min(s.blockIndex, b.offBlocks.length);

  if (s.workDays.filter((w) => !w).length > b.maxDaysOff) s.workDays = [...b.defaultWorkDays];

  const hours = Math.ceil((b.closeMinute - b.openMinute) / 60);
  s.stats.salesByHour = Array.from({ length: hours }, (_, i) => s.stats.salesByHour[i] ?? 0);
  for (const id of Object.keys(s.stats.itemsSold)) if (!(id in content.itemById)) delete s.stats.itemsSold[id];

  s.mood = Math.min(100, Math.max(0, s.mood));
  s.hunger = Math.min(100, Math.max(0, s.hunger));
  return s;
}

/** A playable game from a save: repaired against current content, with its log and start day kept. */
export function restoreGame(content: Content, save: SaveData): Game {
  return Game.fromSnapshot(content, reconcile(save.state as GameState, content), save.log as never, save.startDay);
}
