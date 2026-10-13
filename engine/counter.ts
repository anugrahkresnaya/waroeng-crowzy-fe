// The cashier counter: customer arrivals, patience, and every command the player can issue.
import { dayPart, weekday } from './clock';
import { freshStats } from './state';
import {
  addPieces, bigNotes, exactPieces, exchangeBreakdown, hasPieces, isValidPieces, makeChange, payOutBestEffort,
  removePieces, smallestNoteAtLeast, total,
} from './money';
import type { Rng } from './rng';
import type { Content, CustomerType } from './schema';
import type {
  Command, CommandError, Customer, GameEvent, GameState, Mood, OrderLine, WalkawayReason,
} from './types';

export interface Ctx {
  state: GameState;
  content: Content;
  rng: Rng;
  emit: (event: GameEvent) => void;
}

export type Result = { ok: true } | { ok: false; error: CommandError };
const OK: Result = { ok: true };
const fail = (error: CommandError): Result => ({ ok: false, error });

/** Mood a customer shows right now, from how much patience is left. */
export function moodOf(c: Pick<Customer, 'patience' | 'maxPatience'>): Mood {
  const ratio = c.patience / c.maxPatience;
  if (ratio >= 0.5) return 'happy';
  if (ratio >= 0.2) return 'neutral';
  return 'annoyed';
}

function changeReputation(ctx: Ctx, delta: number): void {
  ctx.state.reputation = Math.min(100, Math.max(0, ctx.state.reputation + delta));
}

// ---------- customers ----------

function billOf(ctx: Ctx, order: OrderLine[]): number {
  return order.reduce((sum, line) => sum + ctx.content.itemById[line.itemId].price * line.qty, 0);
}

function planTender(ctx: Ctx, type: CustomerType, bill: number): ReturnType<typeof exactPieces> {
  const { rng } = ctx;
  if (type.tender === 'big-note') return bigNotes(bill);
  if (type.tender === 'exact-coins') {
    return rng.chance(0.85) ? exactPieces(bill) : smallestNoteAtLeast(bill);
  }
  return rng.chance(0.3) ? exactPieces(bill) : smallestNoteAtLeast(bill);
}

/** Works out the bill, and the cash the customer will hand over, for the current order. */
function planPayment(ctx: Ctx, c: Customer): void {
  c.bill = billOf(ctx, c.order);
  c.tender = c.method === 'cash' && c.bill > 0 ? (planTender(ctx, ctx.content.typeById[c.type], c.bill) ?? {}) : {};
}

function spawnCustomer(ctx: Ctx, type: CustomerType): void {
  const { state, content, rng } = ctx;
  const pool: Array<[string, number]> = Object.entries(type.items);
  const distinct = rng.int(type.distinctItems[0], type.distinctItems[1]);
  const order: OrderLine[] = [];
  for (let i = 0; i < distinct && pool.length > 0; i++) {
    const itemId = rng.weighted(pool);
    pool.splice(pool.findIndex(([id]) => id === itemId), 1);
    const qty = type.maxQty > 1 && rng.chance(0.35) ? rng.int(2, type.maxQty) : 1;
    order.push({ itemId, qty });
  }
  const age = rng.int(type.ageRange[0], type.ageRange[1]);
  const method = rng.weighted(
    (['cash', 'qris', 'kasbon'] as const).map((m) => [m, type.payment[m]] as const),
  );
  const maxPatience = Math.round(content.balance.basePatience * type.patienceMul);
  const customer: Customer = {
    id: state.nextCustomerId++,
    type: type.id,
    age,
    order,
    tray: {},
    patience: maxPatience,
    maxPatience,
    arrivedAt: state.tick,
    stage: 'ordering',
    method,
    bill: 0,
    tender: {},
    ktpChecked: false,
  };
  planPayment(ctx, customer);
  state.line.push(customer);
  ctx.emit({ type: 'customer_arrived', customerId: customer.id, customerType: customer.type });
}

function maybeSpawn(ctx: Ctx): void {
  const { state, content, rng } = ctx;
  const part = dayPart(state.minute);
  if (!part) return;
  const b = content.balance;
  const [lo, hi] = b.arrivalReputationRange;
  const repMul = lo + ((hi - lo) * state.reputation) / 100;
  const rate = Math.min(1, b.arrivalPerMinute[part] * b.weekdayMul[weekday(state.day)] * repMul);
  if (!rng.chance(rate)) return;
  if (state.line.length >= b.lineCapacity) {
    state.stats.turnedAway++;
    changeReputation(ctx, b.reputation.turnedAway);
    ctx.emit({ type: 'turned_away' });
    return;
  }
  const type = rng.weighted(content.customers.map((t) => [t, t.partWeights[part]] as const));
  spawnCustomer(ctx, type);
}

function removeFromLine(ctx: Ctx, c: Customer): void {
  ctx.state.line = ctx.state.line.filter((x) => x !== c);
}

function walkAway(ctx: Ctx, c: Customer, reason: WalkawayReason): void {
  removeFromLine(ctx, c);
  ctx.emit({ type: 'walkaway', customerId: c.id, reason });
}

function drainPatience(ctx: Ctx): void {
  for (const c of [...ctx.state.line]) {
    c.patience -= 1;
    if (c.patience <= 0) {
      ctx.state.stats.walkaways++;
      changeReputation(ctx, ctx.content.balance.reputation.walkaway);
      walkAway(ctx, c, 'patience');
    }
  }
}

// ---------- ending a sale ----------

function completeSale(ctx: Ctx, c: Customer, moodOverride?: Mood): void {
  const { state, content } = ctx;
  const mood = moodOverride ?? moodOf(c);
  let restricted = false;
  for (const line of c.order) {
    state.stock[line.itemId] -= line.qty;
    state.stats.itemsSold[line.itemId] = (state.stats.itemsSold[line.itemId] ?? 0) + line.qty;
    if (content.itemById[line.itemId].ageRestricted) restricted = true;
  }
  state.stats.served++;
  state.stats.moods[mood]++;
  const hour = Math.min(state.stats.salesByHour.length - 1, Math.max(0, Math.floor((state.minute - content.balance.openMinute) / 60)));
  state.stats.salesByHour[hour] += c.bill;
  changeReputation(ctx, content.balance.reputation[mood]);
  if (restricted && c.age < 18) {
    state.stats.underageSales++;
    changeReputation(ctx, content.balance.reputation.underage);
    ctx.emit({ type: 'underage_sale', customerId: c.id });
  }
  removeFromLine(ctx, c);
  ctx.emit({ type: 'sale', customerId: c.id, bill: c.bill, method: c.method, mood });
}

function trayMatchesOrder(c: Customer): boolean {
  const ordered = new Set(c.order.map((l) => l.itemId));
  for (const [itemId, qty] of Object.entries(c.tray)) {
    if (qty > 0 && !ordered.has(itemId)) return false;
  }
  return c.order.every((l) => (c.tray[l.itemId] ?? 0) === l.qty);
}

// ---------- commands ----------

function frontCustomer(ctx: Ctx): Customer | undefined {
  return ctx.state.line[0];
}

/** Checks the warung is open and the shelves are ready, for any command that touches a customer. */
function guardServing(ctx: Ctx): Result {
  const { state } = ctx;
  if (state.phase !== 'open') return fail('wrong_phase');
  if (state.busyUntil > 0) return fail('busy');
  if (!state.shelfReady) return fail('shelves_not_ready');
  return OK;
}

function closeDay(ctx: Ctx): void {
  const { state } = ctx;
  for (const c of [...state.line]) {
    state.stats.leftAtClose++;
    walkAway(ctx, c, 'closing');
  }
  state.phase = 'ended';
  state.busyUntil = 0;
  ctx.emit({ type: 'closed' });
}

export function handleCommand(ctx: Ctx, cmd: Command): Result {
  const { state, content } = ctx;
  const b = content.balance;

  switch (cmd.type) {
    case 'open': {
      if (state.phase !== 'idle') return fail('wrong_phase');
      if (cmd.prepared) {
        if (state.preOpenUsed + b.prepareMinutes > b.preOpenMinutes) return fail('no_time');
        state.preOpenUsed += b.prepareMinutes;
      }
      state.phase = 'open';
      state.minute = b.openMinute;
      state.shelfReady = cmd.prepared;
      ctx.emit({ type: 'opened' });
      return OK;
    }
    case 'restockShelves': {
      if (state.phase !== 'open') return fail('wrong_phase');
      if (state.busyUntil > 0) return fail('busy');
      if (state.shelfReady) return fail('shelves_ready');
      state.busyUntil = state.tick + b.prepMinutes;
      return OK;
    }
    case 'exchangeCash': {
      if (state.phase !== 'idle') return fail('wrong_phase');
      if (!Number.isInteger(cmd.amount) || cmd.amount < 50000 || cmd.amount % 50000 !== 0) return fail('invalid_amount');
      if (state.preOpenUsed + b.exchangeMinutes > b.preOpenMinutes) return fail('no_time');
      const give = makeChange(cmd.amount, { 100000: state.drawer[100000] ?? 0, 50000: state.drawer[50000] ?? 0 });
      if (!give) return fail('not_in_drawer');
      const fee = Math.round((cmd.amount * b.exchangeFeeBp) / 10000);
      removePieces(state.drawer, give);
      addPieces(state.drawer, exchangeBreakdown(cmd.amount - fee));
      state.preOpenUsed += b.exchangeMinutes;
      state.stats.exchangeFees += fee;
      ctx.emit({ type: 'exchanged', amount: cmd.amount, fee });
      return OK;
    }
    case 'nextDay': {
      if (state.phase !== 'ended') return fail('wrong_phase');
      state.day++;
      state.phase = 'idle';
      state.minute = b.openMinute;
      state.shelfReady = false;
      state.busyUntil = 0;
      state.preOpenUsed = 0;
      state.line = [];
      state.stats = freshStats(content);
      if (b.autoRestock) for (const item of content.items) state.stock[item.id] = item.startStock;
      ctx.emit({ type: 'new_day', day: state.day });
      return OK;
    }
    case 'closeWarung': {
      if (state.phase !== 'open') return fail('wrong_phase');
      closeDay(ctx);
      return OK;
    }
  }

  const guard = guardServing(ctx);
  if (!guard.ok) return guard;
  const c = frontCustomer(ctx);
  if (!c) return fail('no_customer');

  switch (cmd.type) {
    case 'pick': {
      if (c.stage !== 'ordering') return fail('wrong_stage');
      const item = content.itemById[cmd.itemId];
      if (!item) return fail('unknown_item');
      if ((state.stock[item.id] ?? 0) - (c.tray[item.id] ?? 0) <= 0) return fail('out_of_stock');
      c.tray[item.id] = (c.tray[item.id] ?? 0) + 1;
      return OK;
    }
    case 'unpick': {
      if (c.stage !== 'ordering') return fail('wrong_stage');
      if ((c.tray[cmd.itemId] ?? 0) <= 0) return fail('not_in_tray');
      c.tray[cmd.itemId] -= 1;
      if (c.tray[cmd.itemId] === 0) delete c.tray[cmd.itemId];
      return OK;
    }
    case 'declineItem': {
      if (c.stage !== 'ordering') return fail('wrong_stage');
      const line = c.order.find((l) => l.itemId === cmd.itemId);
      if (!line) return fail('not_in_order');
      if ((state.stock[line.itemId] ?? 0) < line.qty) state.stats.stockoutDeclines++;
      c.order = c.order.filter((l) => l !== line);
      delete c.tray[cmd.itemId];
      c.patience -= b.penalties.decline;
      if (c.order.length === 0) {
        changeReputation(ctx, b.reputation.emptyOrder);
        walkAway(ctx, c, 'empty_order');
        return OK;
      }
      planPayment(ctx, c);
      return OK;
    }
    case 'checkKtp': {
      if (c.stage !== 'ordering') return fail('wrong_stage');
      if (c.ktpChecked) return fail('already_checked');
      c.ktpChecked = true;
      c.patience -= b.penalties.ktpCheck;
      return OK;
    }
    case 'confirmOrder': {
      if (c.stage !== 'ordering') return fail('wrong_stage');
      if (!trayMatchesOrder(c)) {
        state.stats.wrongTrays++;
        c.patience -= b.penalties.wrongTray;
        ctx.emit({ type: 'order_mismatch', customerId: c.id });
        return OK;
      }
      if (c.method !== 'cash') {
        c.stage = 'paying';
        return OK;
      }
      if (total(c.tender) === c.bill) {
        addPieces(state.drawer, c.tender);
        state.stats.cashRevenue += c.bill;
        completeSale(ctx, c);
        return OK;
      }
      c.stage = 'change';
      return OK;
    }
    case 'confirmQris': {
      if (c.stage !== 'paying') return fail('wrong_stage');
      if (c.method !== 'qris') return fail('wrong_method');
      const fee = Math.ceil((c.bill * b.qrisFeeBp) / 10000);
      state.bank += c.bill - fee;
      state.stats.qrisRevenue += c.bill - fee;
      state.stats.qrisFees += fee;
      completeSale(ctx, c);
      return OK;
    }
    case 'grantKasbon': {
      if (c.stage !== 'paying') return fail('wrong_stage');
      if (c.method !== 'kasbon') return fail('wrong_method');
      state.kasbon.push({ customerId: c.id, type: c.type, amount: c.bill, day: state.day });
      state.stats.kasbonCredit += c.bill;
      completeSale(ctx, c);
      return OK;
    }
    case 'refuseKasbon': {
      if (c.stage !== 'paying') return fail('wrong_stage');
      if (c.method !== 'kasbon') return fail('wrong_method');
      state.stats.kasbonRefused++;
      changeReputation(ctx, b.reputation.kasbonRefused);
      walkAway(ctx, c, 'kasbon_refused');
      return OK;
    }
    case 'giveChange': {
      if (c.stage !== 'change') return fail('wrong_stage');
      if (!isValidPieces(cmd.pieces)) return fail('invalid_pieces');
      const afterTender = { ...state.drawer };
      addPieces(afterTender, c.tender);
      if (!hasPieces(afterTender, cmd.pieces)) return fail('not_in_drawer');

      state.drawer = afterTender;
      removePieces(state.drawer, cmd.pieces);
      state.stats.cashRevenue += c.bill;
      const due = total(c.tender) - c.bill;
      const given = total(cmd.pieces);
      let mood: Mood | undefined;
      if (given > due) {
        state.stats.overChange += given - due;
      } else if (given < due) {
        const short = due - given;
        if (ctx.rng.chance(b.noticeShortChange)) {
          removePieces(state.drawer, payOutBestEffort(state.drawer, short));
          state.stats.shortChangeCaught++;
          changeReputation(ctx, b.reputation.shortChangeCaught);
          mood = 'annoyed';
          ctx.emit({ type: 'short_change_caught', customerId: c.id, short });
        } else {
          state.stats.shortChangeUnnoticed++;
          state.stats.shortChangeGained += short;
        }
      }
      completeSale(ctx, c, mood);
      return OK;
    }
  }
}

/** Advances the open warung by one game minute. */
export function advance(ctx: Ctx): void {
  const { state, content } = ctx;
  if (state.phase !== 'open') return;
  state.tick++;
  state.minute++;
  if (state.busyUntil > 0 && state.tick >= state.busyUntil) {
    state.busyUntil = 0;
    state.shelfReady = true;
    ctx.emit({ type: 'shelves_ready' });
  }
  drainPatience(ctx);
  maybeSpawn(ctx);
  if (state.minute >= content.balance.closeMinute) closeDay(ctx);
}

/** Exact change the drawer can make for the customer at the counter, or null. Handy for bots and hints. */
export function changeFor(state: GameState, c: Customer) {
  const afterTender = { ...state.drawer };
  addPieces(afterTender, c.tender);
  return makeChange(total(c.tender) - c.bill, afterTender);
}
