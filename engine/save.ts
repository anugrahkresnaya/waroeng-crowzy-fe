// Save files: a validated envelope around the game state and its command log.
// `format` is the version of this envelope; `state.version` is the engine state's own version.
// To change either shape, bump the number and add a migration below.
import { z } from 'zod';
import { DENOMS } from './money';
import { Game } from './game';
import { isValidBlockPlan, type Content } from './schema';
import type { GameState } from './types';

export const SAVE_FORMAT = 12;

const num = z.number();
const pieces = z.record(z.string(), z.number().int().min(0));

const quality = z.enum(['kurang', 'pas', 'gosong', 'biasa']);

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
  cooked: z.record(z.string(), z.array(z.object({ quality: quality, cost: num }))),
});

const stats = z.object({
  served: num, walkaways: num, turnedAway: num, leftAtClose: num,
  itemsSold: z.record(z.string(), num),
  cashRevenue: num, qrisRevenue: num, qrisFees: num, kasbonCredit: num, kasbonRefused: num,
  wrongTrays: num, stockoutDeclines: num, underageSales: num, overChange: num,
  shortChangeCaught: num, shortChangeUnnoticed: num, shortChangeGained: num, cogs: num, waste: num, cooking: z.object({ kurang: num, pas: num, gosong: num, biasa: num }), obralRevenue: num, givenRep: num, exchangeFees: num, qrisFake: num, qrisRefused: num, titipanSold: num, titipanReturned: num, titipanPaid: num,
  salesByHour: z.array(num),
  moods: z.object({ happy: num, neutral: num, annoyed: num }),
});

const marketEvent = z.object({ id: z.string(), start: num, end: num.nullable() });

const market = z.object({
  prices: z.record(z.string(), num),
  noise: z.record(z.string(), num),
  history: z.record(z.string(), z.array(num)),
  active: z.array(marketEvent),
  pending: z.array(marketEvent),
  news: z.array(z.object({ day: num, event: z.string(), startsOn: num })),
});

const lot = z.object({
  ingredient: z.string(),
  qty: z.number().min(0),
  bought: num,
  unitCost: num,
  stored: z.enum(['room', 'fridge', 'freezer']),
});

const order = z.object({
  id: num,
  supplier: z.string(),
  lines: z.array(z.object({ key: z.string(), qty: z.number().int().positive(), unitPrice: num })),
  subtotal: num,
  fee: num,
  total: num,
  express: z.boolean(),
  placedDay: num,
  arriveDay: num,
  arriveMinute: num,
  late: z.boolean(),
  lateRolled: z.boolean(),
  status: z.enum(['transit', 'delivered']),
  deliveredDay: num.nullable(),
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
  market,
  pantry: z.array(lot),
  stock: z.record(z.string(), z.number().int().min(0)),
  goodsCost: z.record(z.string(), num),
  menu: z.record(z.string(), z.object({ price: z.number().int().positive(), portion: z.enum(['small', 'normal', 'large']) })),
  display: z.record(z.string(), z.array(z.object({ qty: num, cookedAt: num, unitCost: num }))),
  titipan: z.object({ taken: z.record(z.string(), z.number().int().min(0)), owed: num, relation: num }),
  freezer: z.boolean(),
  bigFridge: z.boolean(),
  shelfLevel: z.number().int().min(0),
  phone: z.object({ battery: num, powerbank: num.nullable(), data: num }),
  qrisPending: z.array(z.object({ amount: num, fake: z.boolean() })),
  token: num,
  tokenOffMinutes: num,
  bills: z.record(z.string(), z.object({ dueDay: num })),
  outage: z.object({ day: num, from: num, hours: num, known: z.boolean(), ice: z.boolean(), genHours: num.optional() }).nullable(),
  lantern: z.boolean(),
  generator: z.boolean(),
  burners: z.array(z.object({ item: z.string(), customerId: num, startedAt: num, auto: z.boolean(), cost: num }).nullable()),
  skill: z.record(z.string(), num),
  orders: z.array(order),
  nextOrderId: num,
  lastSpoiled: z.array(z.object({ ingredient: z.string(), qty: num, value: num, good: z.boolean().optional() })),
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

/**
 * Upgrades an older envelope by one format step. Add an entry when SAVE_FORMAT is bumped.
 * A step that returns null cannot carry the save forward (the new version needs data the old one never had).
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown> | null> = {
  // Format 1 was before the market: no prices, pantry, menu or orders, so there is nothing to build them from.
  1: () => null,
  // Format 2 had no kitchen: nothing on the display, and no waste or leftover figures yet.
  2: (raw) => {
    const state = raw.state as Record<string, unknown> | undefined;
    if (!state || typeof state !== 'object') return null;
    const stats = (state.stats ?? {}) as Record<string, unknown>;
    return { ...raw, state: { ...state, display: {}, stats: { ...stats, waste: 0, obralRevenue: 0, givenRep: 0 } } };
  },
  // Format 3 had no stove: nothing cooking, no practice, and no cooked portions on any tray.
  3: (raw) => {
    const state = raw.state as Record<string, unknown> | undefined;
    if (!state || typeof state !== 'object') return null;
    const stats = (state.stats ?? {}) as Record<string, unknown>;
    const line = Array.isArray(state.line) ? (state.line as Array<Record<string, unknown>>).map((c) => ({ ...c, cooked: {} })) : [];
    return {
      ...raw,
      state: { ...state, burners: [null, null], skill: {}, line, stats: { ...stats, cooking: { kurang: 0, pas: 0, gosong: 0, biasa: 0 } } },
    };
  },
  // Format 4 had no power cuts: none coming, and no lantern.
  4: (raw) => {
    const state = raw.state as Record<string, unknown> | undefined;
    if (!state || typeof state !== 'object') return null;
    return { ...raw, state: { ...state, outage: null, lantern: false } };
  },
  // Format 5 had no electricity token or bills. The token starts at a fixed figure; reconcile adds the bills.
  5: (raw) => {
    const state = raw.state as Record<string, unknown> | undefined;
    if (!state || typeof state !== 'object') return null;
    return { ...raw, state: { ...state, token: 60000, tokenOffMinutes: 0, bills: {} } };
  },
  // Format 6 had no phone: a full battery, the starting data, and no QRIS waiting to be checked.
  6: (raw) => {
    const state = raw.state as Record<string, unknown> | undefined;
    if (!state || typeof state !== 'object') return null;
    const stats = (state.stats ?? {}) as Record<string, unknown>;
    return {
      ...raw,
      state: { ...state, phone: { battery: 100, powerbank: null, data: 1000 }, qrisPending: [], stats: { ...stats, qrisFake: 0, qrisRefused: 0 } },
    };
  },
  // Format 7 had no freezer: none owned, and no frozen goods in stock.
  7: (raw) => {
    const state = raw.state as Record<string, unknown> | undefined;
    if (!state || typeof state !== 'object') return null;
    return { ...raw, state: { ...state, freezer: false } };
  },
  // Format 8 had no titipan: nothing taken, nothing owed, no trust yet.
  8: (raw) => {
    const state = raw.state as Record<string, unknown> | undefined;
    if (!state || typeof state !== 'object') return null;
    const stats = (state.stats ?? {}) as Record<string, unknown>;
    return { ...raw, state: { ...state, titipan: { taken: {}, owed: 0, relation: 0 }, stats: { ...stats, titipanSold: 0, titipanReturned: 0, titipanPaid: 0 } } };
  },
  // Format 9 had only the small fridge.
  9: (raw) => {
    const state = raw.state as Record<string, unknown> | undefined;
    if (!state || typeof state !== 'object') return null;
    return { ...raw, state: { ...state, bigFridge: false } };
  },
  // Format 10 had no generator.
  10: (raw) => {
    const state = raw.state as Record<string, unknown> | undefined;
    if (!state || typeof state !== 'object') return null;
    return { ...raw, state: { ...state, generator: false } };
  },
  // Format 11 had a shelf with no limit.
  11: (raw) => {
    const state = raw.state as Record<string, unknown> | undefined;
    if (!state || typeof state !== 'object') return null;
    return { ...raw, state: { ...state, shelfLevel: 0 } };
  },
};

export type SaveParse =
  | { ok: true; save: SaveData }
  | { ok: false; reason: 'invalid' | 'newer' | 'outdated' };

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
    const next = step(data);
    if (!next) return { ok: false, reason: 'outdated' };
    data = { ...next, format: f + 1 };
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

  const goods = content.items.filter((i) => i.kind === 'good');
  const stock: Record<string, number> = {};
  const goodsCost: Record<string, number> = {};
  for (const item of goods) {
    stock[item.id] = Number.isFinite(s.stock[item.id]) ? s.stock[item.id] : (b.start.goods[item.id] ?? 0);
    goodsCost[item.id] = Number.isFinite(s.goodsCost[item.id]) ? s.goodsCost[item.id] : (item.buyPrice ?? 0);
  }
  // Frozen goods cannot be in stock without a freezer, and frozen stock never sits on a shelf.
  if (!s.freezer) for (const item of goods) if (item.frozen) stock[item.id] = 0;
  s.stock = stock;
  s.goodsCost = goodsCost;

  const menu: GameState['menu'] = {};
  for (const item of content.items.filter((i) => i.kind === 'dish')) {
    const saved = s.menu[item.id];
    menu[item.id] = saved && saved.portion in content.market.portion ? saved : { price: item.price, portion: 'normal' };
  }
  s.menu = menu;

  s.pantry = s.pantry.filter((l) => l.ingredient in content.ingredientById && l.qty > 0);
  if (!s.freezer) for (const l of s.pantry) if (l.stored === 'freezer') l.stored = 'room';
  s.orders = s.orders
    .filter((o) => o.supplier in content.supplierById)
    .map((o) => ({ ...o, lines: o.lines.filter((l) => l.key in content.productByKey) }))
    .filter((o) => o.lines.length > 0);
  for (const id of Object.keys(s.display)) {
    if (!content.itemById[id]?.batch) delete s.display[id];
    else s.display[id] = s.display[id].filter((b) => b.qty > 0);
  }
  s.lastSpoiled = s.lastSpoiled.filter((x) => (x.good ? x.ingredient in content.itemById : x.ingredient in content.ingredientById));

  // Prices: keep what is known, start new products at their base price, drop products that are gone.
  const m = s.market;
  for (const p of content.products) {
    if (!Number.isFinite(m.prices[p.key])) {
      m.prices[p.key] = p.base;
      m.noise[p.key] = 0;
      m.history[p.key] = [p.base];
    }
    m.noise[p.key] ??= 0;
    m.history[p.key] ??= [m.prices[p.key]];
    m.history[p.key] = m.history[p.key].slice(-content.market.historyDays);
  }
  for (const key of Object.keys(m.prices)) {
    if (key in content.productByKey) continue;
    delete m.prices[key];
    delete m.noise[key];
    delete m.history[key];
  }
  const known = new Set(content.market.events.map((e) => e.id));
  m.active = m.active.filter((e) => known.has(e.id));
  m.pending = m.pending.filter((e) => known.has(e.id));
  m.news = m.news.filter((n) => known.has(n.event));

  // Only remove what is not rupiah; zero counts are valid and kept so a load matches the save exactly.
  for (const key of Object.keys(s.drawer)) if (!(DENOMS as readonly number[]).includes(Number(key))) delete s.drawer[Number(key)];

  s.line = s.line.filter((c) => c.type in content.typeById && c.order.every((l) => l.itemId in content.itemById));
  for (const c of s.line) for (const id of Object.keys(c.tray)) if (!(id in content.itemById)) delete c.tray[id];
  for (const c of s.line) for (const id of Object.keys(c.cooked)) if (!content.itemById[id]?.cook) delete c.cooked[id];

  // The stove: the right number of slots, and only dishes that are still cooked to order for customers still here.
  const here = new Set(s.line.map((c) => c.id));
  s.burners = Array.from({ length: b.burners }, (_, i) => {
    const burner = s.burners[i];
    return burner && content.itemById[burner.item]?.cook && here.has(burner.customerId) ? burner : null;
  });
  for (const id of Object.keys(s.skill)) if (!content.itemById[id]?.cook) delete s.skill[id];

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

  // Bills: keep the ones still in the content, start new ones from today.
  const bills: GameState['bills'] = {};
  for (const def of b.bills) bills[def.id] = Number.isFinite(s.bills[def.id]?.dueDay) ? s.bills[def.id] : { dueDay: s.day + def.firstDue };
  s.bills = bills;
  if (!Number.isFinite(s.token) || s.token < 0) s.token = b.token.start;
  for (const id of Object.keys(s.titipan.taken)) if (!content.itemById[id]?.consign) delete s.titipan.taken[id];
  s.titipan.owed = Math.max(0, s.titipan.owed);
  s.titipan.relation = Math.min(100, Math.max(0, s.titipan.relation));
  s.phone.battery = Math.min(100, Math.max(0, s.phone.battery));
  s.phone.data = Math.max(0, s.phone.data);
  if (s.phone.powerbank !== null) s.phone.powerbank = Math.min(b.phone.powerbank.capacity, Math.max(0, s.phone.powerbank));

  s.mood = Math.min(100, Math.max(0, s.mood));
  s.hunger = Math.min(100, Math.max(0, s.hunger));
  return s;
}

/** A playable game from a save: repaired against current content, with its log and start day kept. */
export function restoreGame(content: Content, save: SaveData): Game {
  return Game.fromSnapshot(content, reconcile(save.state as GameState, content), save.log as never, save.startDay);
}
