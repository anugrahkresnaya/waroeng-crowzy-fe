// The market: simulated prices, supplier orders and delivery, the pantry (with spoilage and a small
// fridge), pasar trips, and what each dish costs to make. Time and chance come only from the game.
import { addDays, inRange } from './calendar';
import { freezerFailedOvernight, freezerRoom, frozenSlotsNeeded } from './freezer';
import { fridgeSpoilsAsRoom } from './outage';
import { shelfNeeded, shelfRoom } from './shelf';
import type { Rng } from './rng';
import { goodKey, type Content, type Item, type Portion, type Product } from './schema';
import type { CommandError, GameEvent, GameState, Lot, MarketState, Order, PurchaseLine, Spoiled } from './types';

export interface MarketCtx {
  state: GameState;
  content: Content;
  rng: Rng;
  emit: (event: GameEvent) => void;
}

type Err = CommandError | null;

// ---------------------------------------------------------------- prices

/** Prices round to Rp500 for big items, Rp100 for mid ones and Rp50 for small ones. */
export function roundPrice(price: number): number {
  const step = price >= 20000 ? 500 : price >= 5000 ? 100 : 50;
  return Math.max(step, Math.round(price / step) * step);
}

const matches = (p: Product, tokens: string[]) => tokens.some((t) => t === 'all' || t === p.category || t === p.id);

export function emptyMarket(): MarketState {
  return { prices: {}, noise: {}, history: {}, active: [], pending: [], news: [] };
}

/** The seasons and events pushing a product's price on a given day, as one multiplier. */
export function priceMultiplier(content: Content, market: MarketState, product: Product, day: number): number {
  let mult = 1;
  const date = addDays(content.market.calendarStart, day);
  for (const season of content.market.seasons) {
    if (!inRange(date, season.from, season.to)) continue;
    for (const e of season.effects) if (matches(product, e.match)) mult *= e.mul;
  }
  for (const ev of market.active) {
    if (ev.start > day || (ev.end !== null && day > ev.end)) continue;
    const def = content.market.events.find((d) => d.id === ev.id);
    if (!def) continue;
    const length = ev.end === null ? 1 : ev.end - ev.start + 1;
    const factor = def.decay === 'linear' && ev.end !== null ? Math.max(0, 1 - (day - ev.start) / length) : 1;
    for (const e of def.effects) if (matches(product, e.match)) mult *= 1 + e.delta * factor;
  }
  return mult;
}

/** One day of the market: events start and end, the wobble pulls back, prices are set and recorded. */
function stepMarket(state: GameState, content: Content, rng: Rng, day: number, withEvents: boolean, emit?: (e: GameEvent) => void): void {
  const m = state.market;
  const cfg = content.market;
  if (withEvents) {
    const waiting: MarketState['pending'] = [];
    for (const p of m.pending) (p.start <= day ? m.active : waiting).push(p);
    m.pending = waiting;
    m.active = m.active.filter((e) => e.end === null || e.end >= day);
    if (day >= cfg.eventsFromDay) {
      const month = addDays(cfg.calendarStart, day).month;
      for (const def of cfg.events) {
        if (m.active.some((e) => e.id === def.id) || m.pending.some((e) => e.id === def.id)) continue;
        if (def.months && !def.months.includes(month)) continue;
        if (!rng.chance(def.chancePerDay)) continue;
        const start = day + def.leadDays;
        const ev = { id: def.id, start, end: def.duration === null ? null : start + def.duration - 1 };
        (start <= day ? m.active : m.pending).push(ev);
        m.news.push({ day, event: def.id, startsOn: start });
        emit?.({ type: 'news', event: def.id });
      }
    }
    m.news = m.news.slice(-20);
  }
  for (const p of content.products) {
    const swing = cfg.swings[p.swing];
    const g = 2 * (rng.float() + rng.float() + rng.float() - 1.5);
    const noise = Math.max(-swing.cap, Math.min(swing.cap, (m.noise[p.key] ?? 0) * (1 - cfg.reversion) + swing.daily * g));
    m.noise[p.key] = noise;
    const price = roundPrice(p.base * priceMultiplier(content, m, p, day) * (1 + noise));
    m.prices[p.key] = price;
    const history = (m.history[p.key] ??= []);
    history.push(price);
    while (history.length > cfg.historyDays) history.shift();
  }
}

/** Builds the market with a month of price history already behind it, so charts exist from day one. */
export function initMarket(state: GameState, content: Content, rng: Rng): void {
  state.market = emptyMarket();
  for (let k = content.market.historyDays; k >= 1; k--) stepMarket(state, content, rng, state.day - k, false);
  stepMarket(state, content, rng, state.day, true);
}

export function advanceMarketDay(ctx: MarketCtx): void {
  stepMarket(ctx.state, ctx.content, ctx.rng, ctx.state.day, true, ctx.emit);
}

/** How much longer than usual deliveries run late while events like a flood last. */
function lateBoost(state: GameState, content: Content): number {
  let boost = 0;
  for (const ev of state.market.active) {
    if (ev.start > state.day) continue;
    boost += content.market.events.find((d) => d.id === ev.id)?.lateBoost ?? 0;
  }
  return boost;
}

// ---------------------------------------------------------------- pantry

export const ingredientQty = (state: GameState, id: string): number => state.pantry.reduce((s, l) => (l.ingredient === id ? s + l.qty : s), 0);

export function addLot(state: GameState, ingredient: string, qty: number, unitCost: number): void {
  state.pantry.push({ ingredient, qty, bought: state.day, unitCost, stored: 'room' });
}

/** Uses up an ingredient, oldest stock first. Returns what was taken and what it cost. */
export function consume(state: GameState, ingredient: string, amount: number): { taken: number; cost: number } {
  let left = amount;
  let cost = 0;
  for (const lot of state.pantry) {
    if (left <= 1e-9) break;
    if (lot.ingredient !== ingredient) continue;
    const used = Math.min(lot.qty, left);
    lot.qty -= used;
    left -= used;
    cost += used * lot.unitCost;
  }
  state.pantry = state.pantry.filter((l) => l.qty > 1e-9);
  return { taken: amount - left, cost };
}

/** Days a lot keeps in a place; null means it does not spoil there, undefined that the place cannot hold it. */
const lifeIn = (ing: Content['ingredients'][number], place: 'room' | 'fridge' | 'freezer'): number | null | undefined => ing.life[place];

/** Longest an ingredient keeps in a place, counting "does not spoil" as forever. */
const keeps = (days: number | null | undefined): number => (days === undefined ? -1 : days === null ? Infinity : days);

/**
 * Puts the oldest stock where it keeps longest. The freezer comes first (what it holds that freezes well, after the frozen goods),
 * then the small fridge for what lasts longer cold; the rest stays at room temperature.
 */
export function assignStorage(state: GameState, content: Content): void {
  const lots = [...state.pantry].sort((a, b) => a.bought - b.bought);
  let frozen = state.freezer ? content.items.reduce((s, i) => s + (i.frozen ? (state.stock[i.id] ?? 0) * i.frozen.slots : 0), 0) : 0;
  let cold = 0;
  for (const lot of lots) {
    const ing = content.ingredientById[lot.ingredient];
    const units = lot.qty / ing.unitSize;
    const other = Math.max(keeps(lifeIn(ing, 'room')), keeps(lifeIn(ing, 'fridge')));
    if (state.freezer && keeps(lifeIn(ing, 'freezer')) > other && frozen + units <= content.market.freezerCapacity + 1e-9) {
      lot.stored = 'freezer';
      frozen += units;
      continue;
    }
    const helps = ing.life.fridge !== null && (ing.life.room === null || ing.life.fridge > ing.life.room);
    if (helps && cold + units <= fridgeCap(state, content) + 1e-9) {
      lot.stored = 'fridge';
      cold += units;
    } else lot.stored = 'room';
  }
}

/** Fridge space, in sold units: the small fridge or the big one. */
export const fridgeCap = (state: GameState, content: Content): number => (state.bigFridge ? content.market.bigFridge.capacity : content.market.fridgeCapacity);

/** Fridge space in use, in sold units. */
export function fridgeUsed(state: GameState, content: Content): number {
  return state.pantry.reduce((s, l) => (l.stored === 'fridge' ? s + l.qty / content.ingredientById[l.ingredient].unitSize : s), 0);
}

/** Overnight: whatever outlived its shelf life is thrown away. */
export function spoilOvernight(ctx: MarketCtx): void {
  const { state, content } = ctx;
  const gone = new Map<string, Spoiled>();
  const fridgeFailed = fridgeSpoilsAsRoom(state, content);
  const freezerFailed = freezerFailedOvernight(state, content);
  state.pantry = state.pantry.filter((lot) => {
    const ing = content.ingredientById[lot.ingredient];
    const place = (lot.stored === 'fridge' && fridgeFailed) || (lot.stored === 'freezer' && freezerFailed) ? 'room' : lot.stored;
    const life = ing.life[place] ?? null;
    if (life === null || state.day - lot.bought <= life) return true;
    const entry = gone.get(lot.ingredient) ?? { ingredient: lot.ingredient, qty: 0, value: 0 };
    entry.qty += lot.qty / ing.unitSize;
    entry.value += lot.qty * lot.unitCost;
    gone.set(lot.ingredient, entry);
    return false;
  });
  state.lastSpoiled = [...gone.values()].map((s) => ({ ...s, value: Math.round(s.value) }));
  // A freezer that lost its cold ruins every frozen good in it.
  if (freezerFailed) {
    for (const item of content.items) {
      const pieces = state.stock[item.id] ?? 0;
      if (!item.frozen || pieces <= 0) continue;
      state.lastSpoiled.push({ ingredient: item.id, qty: pieces, value: Math.round(pieces * (state.goodsCost[item.id] ?? 0)), good: true });
      state.stats.waste += pieces * (state.goodsCost[item.id] ?? 0);
      state.stock[item.id] = 0;
    }
  }
  const value = state.lastSpoiled.reduce((s, x) => s + x.value, 0);
  if (value > 0) ctx.emit({ type: 'spoiled', value });
}

// ---------------------------------------------------------------- dishes and goods

/** Portions on the display that are still good. */
export function displayPortions(state: GameState, itemId: string): number {
  return (state.display[itemId] ?? []).reduce((s, b) => s + b.qty, 0);
}

/** Takes portions off the display, oldest first, and returns what they cost. */
export function takeFromDisplay(state: GameState, itemId: string, qty: number): number {
  const batches = state.display[itemId] ?? [];
  let cost = 0;
  let left = qty;
  while (left > 0 && batches.length > 0) {
    const batch = batches[0];
    const take = Math.min(batch.qty, left);
    cost += take * batch.unitCost;
    batch.qty -= take;
    left -= take;
    if (batch.qty <= 0) batches.shift();
  }
  if (batches.length === 0) delete state.display[itemId];
  return cost;
}


export const portionOf = (state: GameState, item: Item): Portion => state.menu[item.id]?.portion ?? 'normal';

/** What one portion of a dish uses right now, in each ingredient's base unit. */
export function dishNeeds(state: GameState, content: Content, item: Item): Record<string, number> {
  const mul = content.market.portion[portionOf(state, item)].mul;
  return Object.fromEntries(Object.entries(item.recipe ?? {}).map(([ing, amount]) => [ing, amount * mul]));
}

/** Frozen goods one portion uses, in pieces. Portion size does not change it. */
export const goodNeeds = (item: Item): Record<string, number> => item.recipeGoods ?? {};

/** What the stock of frozen goods allows: how many portions a dish can still make from them. */
export function goodsPortions(state: GameState, item: Item): number {
  let most = Infinity;
  for (const [id, per] of Object.entries(goodNeeds(item))) most = Math.min(most, Math.floor(((state.stock[id] ?? 0) + 1e-9) / per));
  return most;
}

/** Takes the frozen goods for `portions` portions out of the stock and returns what they cost. */
export function consumeGoods(state: GameState, content: Content, item: Item, portions: number): number {
  let cost = 0;
  for (const [id, per] of Object.entries(goodNeeds(item))) {
    const pieces = Math.round(per * portions);
    state.stock[id] = Math.max(0, (state.stock[id] ?? 0) - pieces);
    cost += pieces * (state.goodsCost[id] ?? content.itemById[id].buyPrice ?? 0);
  }
  return cost;
}

/** The price a customer pays for one: the menu price for a dish, the shelf price for a good. */
export const sellPrice = (state: GameState, item: Item): number => (item.kind === 'dish' ? (state.menu[item.id]?.price ?? item.price) : item.price);

/** How many more of this item can be given out, counting what is already on the tray. */
export function portionsLeft(state: GameState, content: Content, itemId: string, tray: Record<string, number> = {}): number {
  const item = content.itemById[itemId];
  if (!item) return 0;
  if (item.kind === 'good') return Math.max(0, (state.stock[item.id] ?? 0) - (tray[item.id] ?? 0));
  if (item.batch) return Math.max(0, displayPortions(state, item.id) - (tray[item.id] ?? 0));
  const reserved: Record<string, number> = {};
  for (const [id, qty] of Object.entries(tray)) {
    const other = content.itemById[id];
    if (!other || other.kind !== 'dish' || other.cook || other.batch || qty <= 0) continue;
    for (const [ing, need] of Object.entries(dishNeeds(state, content, other))) reserved[ing] = (reserved[ing] ?? 0) + need * qty;
  }
  let most = Infinity;
  for (const [ing, need] of Object.entries(dishNeeds(state, content, item))) {
    most = Math.min(most, Math.floor((ingredientQty(state, ing) - (reserved[ing] ?? 0) + 1e-9) / need));
  }
  return Number.isFinite(most) ? Math.max(0, most) : 0;
}

/** What a unit of a product costs on the market today (per sold unit). */
export const marketPrice = (state: GameState, key: string): number => state.market.prices[key] ?? 0;

/** The cost of one portion at today's market prices (what it would cost to replace what it uses). */
export function costPerPortion(state: GameState, content: Content, item: Item, portion: Portion = portionOf(state, item)): number {
  if (item.kind === 'good') return marketPrice(state, goodKey(item.id)) / (item.pack ?? 1);
  const mul = content.market.portion[portion].mul;
  let total = 0;
  for (const [id, amount] of Object.entries(item.recipe ?? {})) {
    const ing = content.ingredientById[id];
    total += ((amount * mul) / ing.unitSize) * marketPrice(state, id);
  }
  for (const [id, per] of Object.entries(goodNeeds(item))) total += per * (marketPrice(state, goodKey(id)) / (content.itemById[id].pack ?? 1));
  return total;
}

/** What a portion would cost if every ingredient were at its base price, to show how far the market has moved. */
export function baseCostPerPortion(content: Content, item: Item, portion: Portion = 'normal'): number {
  const mul = content.market.portion[portion].mul;
  let total = 0;
  for (const [id, amount] of Object.entries(item.recipe ?? {})) {
    const ing = content.ingredientById[id];
    total += ((amount * mul) / ing.unitSize) * ing.price;
  }
  for (const [id, per] of Object.entries(goodNeeds(item))) total += per * (content.itemById[id].buyPrice ?? 0);
  return total;
}

/** Uses up what a sale needs: ingredients for a dish, shelf stock for a good. Returns what it cost. */
export function sellOut(state: GameState, content: Content, item: Item, qty: number): number {
  if (item.kind === 'good') {
    state.stock[item.id] = Math.max(0, (state.stock[item.id] ?? 0) - qty);
    return qty * (state.goodsCost[item.id] ?? (item.buyPrice ?? 0));
  }
  if (item.batch) return takeFromDisplay(state, item.id, qty);
  let cost = 0;
  for (const [ing, need] of Object.entries(dishNeeds(state, content, item))) cost += consume(state, ing, need * qty).cost;
  return cost;
}

// ---------------------------------------------------------------- buying

function addPurchased(ctx: MarketCtx, lines: PurchaseLine[], melting = false): void {
  const { state, content } = ctx;
  for (const line of lines) {
    const product = content.productByKey[line.key];
    if (product.kind === 'ingredient') {
      const ing = content.ingredientById[product.id];
      addLot(state, ing.id, line.qty * ing.unitSize, line.unitPrice / ing.unitSize);
    } else {
      const item = content.itemById[product.id];
      let pieces = line.qty * (item.pack ?? 1);
      const unitCost = line.unitPrice / (item.pack ?? 1);
      if (item.frozen && melting && !state.freezer) {
        // Bought on a trip with no freezer: sold within a few hours of opening, or it melts.
        state.melt.push({ item: item.id, qty: pieces, at: state.day * 1440 + content.balance.openMinute + content.market.pasar.meltMinutes });
      } else if (item.frozen) {
        // Frozen goods go straight into the freezer: what does not fit (or has no freezer) is lost.
        const fit = Math.min(pieces, Math.floor((freezerRoom(state, content) + 1e-9) / item.frozen.slots));
        if (fit < pieces) {
          state.stats.waste += (pieces - fit) * unitCost;
          ctx.emit({ type: 'frozen_lost', item: item.id, pieces: pieces - fit });
        }
        pieces = fit;
        if (pieces === 0) continue;
      }
      const have = state.stock[item.id] ?? 0;
      state.goodsCost[item.id] = (have * (state.goodsCost[item.id] ?? unitCost) + pieces * unitCost) / (have + pieces);
      state.stock[item.id] = have + pieces;
    }
  }
  assignStorage(state, content);
}

/** Checks a list of lines the player wants to buy; returns the merged lines or the reason it is refused. */
function checkLines(content: Content, lines: Array<{ key: string; qty: number }>): { error: Err; merged: Array<{ key: string; qty: number }> } {
  const merged = new Map<string, number>();
  for (const l of lines) {
    if (!content.productByKey[l.key]) return { error: 'unknown_product', merged: [] };
    if (!Number.isInteger(l.qty) || l.qty < 0) return { error: 'invalid_quantity', merged: [] };
    if (l.qty > 0) merged.set(l.key, (merged.get(l.key) ?? 0) + l.qty);
  }
  if (merged.size === 0) return { error: 'empty_order', merged: [] };
  return { error: null, merged: [...merged].map(([key, qty]) => ({ key, qty })) };
}

/** What the phone app charges: supplier price per unit, and the delivery fee. */
export function quoteOrder(state: GameState, content: Content, supplierId: string, lines: Array<{ key: string; qty: number }>, express: boolean) {
  const supplier = content.supplierById[supplierId];
  const priced: PurchaseLine[] = lines.map((l) => ({ key: l.key, qty: l.qty, unitPrice: roundPrice(marketPrice(state, l.key) * supplier.priceMul) }));
  const subtotal = priced.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const base = express ? content.market.ordering.expressFee : supplier.freeAbove !== null && subtotal >= supplier.freeAbove ? 0 : supplier.deliveryFee;
  const cold = frozenSlotsNeeded(content, lines) > 0 ? content.market.ordering.frozenFee : 0;
  const fee = base + cold;
  return { priced, subtotal, fee, cold, total: subtotal + fee };
}

/** When a standard order placed now would arrive: tomorrow before the cutoff, otherwise the day after. */
export function standardArrivalDay(state: GameState, content: Content): number {
  return state.minute < content.market.ordering.cutoffMinute && (state.phase === 'idle' || state.phase === 'open' || state.phase === 'dayoff') ? state.day + 1 : state.day + 2;
}

export function placeOrder(ctx: MarketCtx, cmd: { supplier: string; lines: Array<{ key: string; qty: number }>; express: boolean }): Err {
  const { state, content } = ctx;
  const supplier = content.supplierById[cmd.supplier];
  if (!supplier) return 'unknown_supplier';
  const checked = checkLines(content, cmd.lines);
  if (checked.error) return checked.error;
  if (!state.freezer && frozenSlotsNeeded(content, checked.merged) > 0) return 'needs_freezer';
  if (shelfNeeded(content, checked.merged) > shelfRoom(state, content) + 1e-9) return 'shelf_full';
  const q = quoteOrder(state, content, cmd.supplier, checked.merged, cmd.express);
  if (q.subtotal < supplier.minOrder) return 'below_minimum';
  if (state.bank < q.total) return 'insufficient_funds';

  const ordering = content.market.ordering;
  let arriveDay = standardArrivalDay(state, content);
  let arriveMinute = ordering.windowStart;
  if (cmd.express) {
    const resting = state.phase === 'ended' || state.phase === 'night' || state.phase === 'bed';
    const at = state.minute + ordering.expressMinutes;
    if (resting || at >= content.balance.closeMinute) {
      arriveDay = state.day + 1;
      arriveMinute = 0;
    } else {
      arriveDay = state.day;
      arriveMinute = at;
    }
  }
  const order: Order = {
    id: state.nextOrderId++,
    supplier: cmd.supplier,
    lines: q.priced,
    subtotal: q.subtotal,
    fee: q.fee,
    total: q.total,
    express: cmd.express,
    placedDay: state.day,
    arriveDay,
    arriveMinute,
    late: false,
    lateRolled: false,
    status: 'transit',
    deliveredDay: null,
  };
  state.bank -= q.total;
  state.orders.push(order);
  ctx.emit({ type: 'order_placed', orderId: order.id, total: order.total });
  return null;
}

/** Delivers what is due. A standard order that is due for the first time may turn out to be late. */
export function deliverDue(ctx: MarketCtx): void {
  const { state, content, rng } = ctx;
  for (const order of state.orders) {
    if (order.status !== 'transit') continue;
    const due = order.arriveDay < state.day || (order.arriveDay === state.day && (!order.express || order.arriveMinute <= state.minute));
    if (!due) continue;
    if (!order.express && !order.lateRolled) {
      order.lateRolled = true;
      const chance = Math.min(1, content.supplierById[order.supplier].lateChance + lateBoost(state, content));
      if (rng.chance(chance)) {
        order.late = true;
        order.arriveDay = state.day + 1;
        ctx.emit({ type: 'order_late', orderId: order.id, arriveDay: order.arriveDay });
        continue;
      }
    }
    addPurchased(ctx, order.lines);
    order.status = 'delivered';
    order.deliveredDay = state.day;
    ctx.emit({ type: 'order_delivered', orderId: order.id });
  }
  const delivered = state.orders.filter((o) => o.status === 'delivered');
  if (delivered.length > 15) {
    const drop = new Set(delivered.slice(0, delivered.length - 15).map((o) => o.id));
    state.orders = state.orders.filter((o) => !drop.has(o.id));
  }
}

/** Going to the pasar before opening on a work day: it takes pre-open time, and then the pasar app buys on the spot. */
export function startPasarTrip(ctx: MarketCtx): Err {
  const { state, content } = ctx;
  if (state.phase !== 'idle') return 'wrong_phase';
  if (state.tripToday) return 'trip_done';
  const minutes = content.market.pasar.tripMinutes;
  if (state.preOpenUsed + minutes > content.balance.preOpenMinutes) return 'no_time';
  state.preOpenUsed += minutes;
  state.tripToday = true;
  ctx.emit({ type: 'trip_started' });
  return null;
}

/** Frozen goods bought without a freezer melt at their deadline. Called every game minute while open, and overnight. */
export function meltSweep(ctx: MarketCtx, now: number): void {
  const { state, content } = ctx;
  if (state.melt.length === 0) return;
  const keep: GameState['melt'] = [];
  for (const m of state.melt) {
    if (m.at > now) {
      keep.push(m);
      continue;
    }
    const pieces = Math.min(state.stock[m.item] ?? 0, m.qty);
    if (pieces <= 0) continue;
    state.stock[m.item] -= pieces;
    state.stats.waste += pieces * (state.goodsCost[m.item] ?? 0);
    ctx.emit({ type: 'frozen_melted', item: m.item, pieces });
  }
  state.melt = keep;
}

/** The pasar trip the player is on right now: a day-off block, or the pre-open hours of a work day after going. */
export function onPasarTrip(state: GameState, content: Content): boolean {
  if (state.phase === 'idle') return state.tripToday;
  if (state.phase !== 'dayoff') return false;
  const block = content.balance.offBlocks[state.blockIndex];
  return !!block && (state.offPlan[block.id] ?? []).includes('ke-pasar');
}

/** Buying in person: today's market price, a little haggling, a bulk discount, and the goods are yours at once. */
export function pasarTrip(ctx: MarketCtx, cmd: { lines: Array<{ key: string; qty: number }> }): Err {
  const { state, content, rng } = ctx;
  if (!onPasarTrip(state, content)) return 'no_pasar_trip';
  const checked = checkLines(content, cmd.lines);
  if (checked.error) return checked.error;
  const slots = frozenSlotsNeeded(content, checked.merged);
  // Without a freezer, frozen goods can only be bought on a work-day trip, to be sold before they melt.
  const selling = state.phase === 'idle';
  if (slots > 0 && !state.freezer && !selling) return 'needs_freezer';
  if (state.freezer && slots > freezerRoom(state, content) + 1e-9) return 'freezer_full';
  if (shelfNeeded(content, checked.merged) > shelfRoom(state, content) + 1e-9) return 'shelf_full';
  const haggle = content.market.pasar.haggle;
  const rngBefore = state.rng;
  const priced: PurchaseLine[] = checked.merged.map((l) => ({
    key: l.key,
    qty: l.qty,
    unitPrice: roundPrice(marketPrice(state, l.key) * (1 + (rng.float() * 2 - 1) * haggle)),
  }));
  const subtotal = priced.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const off = [...content.market.pasar.grosir].reverse().find((g) => subtotal >= g.min)?.off ?? 0;
  const total = Math.round((subtotal * (1 - off)) / 100) * 100;
  if (state.bank < total) {
    state.rng = rngBefore; // a refused purchase must leave no trace, not even the haggling dice
    return 'insufficient_funds';
  }
  state.bank -= total;
  // the discount lowers what each unit cost you
  const factor = subtotal > 0 ? total / subtotal : 1;
  addPurchased(ctx, priced.map((l) => ({ ...l, unitPrice: l.unitPrice * factor })), selling);
  ctx.emit({ type: 'pasar_bought', total });
  return null;
}

/** What the pasar would charge right now, without haggling, for the app to show. */
export function pasarQuote(state: GameState, content: Content, lines: Array<{ key: string; qty: number }>) {
  const subtotal = lines.reduce((s, l) => s + marketPrice(state, l.key) * l.qty, 0);
  const off = [...content.market.pasar.grosir].reverse().find((g) => subtotal >= g.min)?.off ?? 0;
  return { subtotal, off, total: Math.round((subtotal * (1 - off)) / 100) * 100 };
}

export type { Lot };
