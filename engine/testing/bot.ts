// A headless player used by tests and, later, balance checks. It never rolls dice itself,
// so a run is fully decided by the seed and these rules.
import { changeFor } from '../counter';
import { stillToCook } from '../cooking';
import { portionsLeft, quoteOrder } from '../market';
import { Game } from '../game';
import { payOutBestEffort, addPieces } from '../money';
import { qrisCheck } from '../phone';
import { shelfCap, shelfRoom, slotsOf } from '../shelf';
import type { Command } from '../types';

export interface BotOptions {
  /** Commands the bot can issue per game minute; fractions work (0.25 = one every 4 minutes). */
  actionsPerTick: number;
  prepared?: boolean;
  /** Cook the batch dishes before opening (default). Without it everything the display sells runs out and is not replaced. */
  cookAhead?: boolean;
  /** How many batches of each batch dish to cook before opening: 1 is the old behaviour, `fill` keeps cooking round-robin until the pre-open time or the ingredients run out. */
  batches?: number | 'fill';
  /** Restock up to this many times the starting levels (default 1). */
  restockMul?: number;
}

/** Issues the next sensible command for the customer at the counter, or returns false if none. */
export function botAct(game: Game): boolean {
  const { state, content } = game;
  const c = state.line[0];
  if (!c || state.busyUntil > 0) return false;
  if (!state.shelfReady) return game.dispatch({ type: 'restockShelves' }).ok;
  const send = (command: Command) => game.dispatch(command).ok;

  if (c.stage === 'ordering') {
    const restricted = c.order.find((l) => content.itemById[l.itemId].ageRestricted);
    if (restricted && !c.ktpChecked) return send({ type: 'checkKtp' });
    if (restricted && c.age < 18) return send({ type: 'declineItem', itemId: restricted.itemId });
    // Plate whatever has reached its time, then put on what still needs cooking.
    const ready = state.burners.findIndex((b) => b && !b.auto && b.customerId === c.id && state.tick - b.startedAt >= content.itemById[b.item].cook!.minutes);
    if (ready >= 0) return send({ type: 'plate', burner: ready });
    for (const line of c.order) {
      if ((c.tray[line.itemId] ?? 0) >= line.qty) continue;
      if (content.itemById[line.itemId].cook) {
        if (stillToCook(state, c, line.itemId) <= 0) return false; // on the stove, wait for it
        if (portionsLeft(state, content, line.itemId) <= 0) return send({ type: 'declineItem', itemId: line.itemId });
        if (state.burners.every((b) => b)) return false;
        return send({ type: 'startCook', item: line.itemId, auto: false });
      }
      if (portionsLeft(state, content, line.itemId, c.tray) <= 0) return send({ type: 'declineItem', itemId: line.itemId });
      return send({ type: 'pick', itemId: line.itemId });
    }
    return send({ type: 'confirmOrder' });
  }
  if (c.stage === 'paying') {
    if (c.method === 'qris') return send(qrisCheck(state, content).ok ? { type: 'confirmQris' } : { type: 'trustQris' });
    return send({ type: 'grantKasbon' });
  }
  const pieces = changeFor(state, c) ?? (() => {
    const drawer = { ...state.drawer };
    addPieces(drawer, c.tender);
    const due = Object.entries(c.tender).reduce((s, [d, n]) => s + Number(d) * n, 0) - c.bill;
    return payOutBestEffort(drawer, due);
  })();
  return send({ type: 'giveChange', pieces });
}

/** Plays one whole open day. */
export function playDay(game: Game, options: BotOptions = { actionsPerTick: 4 }): Game {
  if (game.state.phase === 'idle' && (options.cookAhead ?? true)) cookAhead(game, options.prepared ?? true, options.batches ?? 1);
  // With no time left to prepare the shelves, open anyway and restock while serving, as a player would.
  if (!game.dispatch({ type: 'open', prepared: options.prepared ?? true }).ok) game.dispatch({ type: 'open', prepared: false });
  let budget = 0;
  while (game.state.phase === 'open') {
    budget = Math.min(budget + options.actionsPerTick, Math.max(1, options.actionsPerTick));
    while (budget >= 1 && botAct(game)) budget -= 1;
    game.tick();
  }
  return game;
}

/** Cooks one batch of each batch dish that still fits in the pre-open time, keeping the time that preparing the shelves needs. */
export function cookAhead(game: Game, prepared = true, batches: number | 'fill' = 1): void {
  const { content } = game;
  const reserve = prepared ? content.balance.prepareMinutes : 0;
  const rounds = batches === 'fill' ? 50 : batches;
  for (let round = 0; round < rounds; round++) {
    let cooked = false;
    for (const item of content.items) {
      if (!item.batch) continue;
      if (game.state.preOpenUsed + item.batch.minutes + reserve > content.balance.preOpenMinutes) continue;
      if (game.dispatch({ type: 'cookBatch', item: item.id, batches: 1 }).ok) cooked = true;
    }
    if (!cooked) break;
  }
}

/** From the end-of-day summary to the start of the next day, the way a player would. */
export function sleepThrough(game: Game, options: { freeTime?: string[]; open?: boolean } = {}): void {
  if (game.state.phase === 'ended') game.dispatch({ type: 'goToNight' });
  game.dispatch({ type: 'spendFreeTime', activities: options.freeTime ?? ['makan'] });
  if (options.open !== undefined) game.dispatch({ type: 'decideTomorrow', open: options.open });
  game.dispatch({ type: 'nextDay' });
}

/** Plays whatever the current day is: a shop day with the bot, or every day-off block. */
export function playAnyDay(game: Game, options: BotOptions = { actionsPerTick: 4 }): void {
  bankTheBigNotes(game);
  restock(game);
  payUp(game);
  manageChange(game);
  if (game.state.phase === 'dayoff') {
    while (game.state.phase === 'dayoff') game.dispatch({ type: 'runBlock' });
    return;
  }
  playDay(game, options);
}

/** Keeps the lights on and pays what is due, the way a careful player would. */
export function payUp(game: Game): void {
  const { state, content } = game;
  // A day of open hours burns about this much; top up before it could run dry.
  const need = content.balance.token.openPerMinute * (content.balance.closeMinute - content.balance.openMinute) + content.balance.token.perDay;
  if (state.token < need) game.dispatch({ type: 'buyToken', amount: content.balance.token.packs[1] });
  if (state.phone.data < content.balance.phone.lowData * 3) game.dispatch({ type: 'buyData', pack: 0 });
  for (const bill of content.balance.bills) {
    if (state.bank >= bill.amount && state.day >= state.bills[bill.id].dueDay - bill.noticeDays) game.dispatch({ type: 'payBill', id: bill.id });
  }
}

/** Before opening: when small notes and coins are running low, take money out of the bank and exchange it for small change (tukar uang). */
export function manageChange(game: Game, floor = 60000): void {
  const { state } = game;
  if (state.phase !== 'idle') return;
  const small = Object.entries(state.drawer).reduce((sum, [d, n]) => (Number(d) <= 20000 ? sum + Number(d) * n : sum), 0);
  if (small >= floor || state.bank < 100000) return;
  if (game.dispatch({ type: 'withdrawCash', amount: 100000 }).ok) game.dispatch({ type: 'exchangeCash', amount: 100000 });
}

/** Banks the big notes the till does not need, keeping a float of 20.000 notes for change. */
export function bankTheBigNotes(game: Game): void {
  const { drawer } = game.state;
  const pieces: Record<number, number> = {};
  if ((drawer[100000] ?? 0) > 0) pieces[100000] = drawer[100000];
  if ((drawer[50000] ?? 0) > 0) pieces[50000] = drawer[50000];
  if (Object.keys(pieces).length > 0) game.dispatch({ type: 'depositCash', pieces });
}

/**
 * Orders enough from the main supplier to bring every ingredient and good back up to its starting level,
 * counting what is already on the way. Skips what the bank cannot cover.
 */
export function restock(game: Game, supplier = 'pak-slamet', mul = 1): void {
  const { state, content } = game;
  const incoming: Record<string, number> = {};
  for (const o of state.orders) if (o.status === 'transit') for (const l of o.lines) incoming[l.key] = (incoming[l.key] ?? 0) + l.qty;
  const lines: Array<{ key: string; qty: number }> = [];
  for (const [id, target] of Object.entries(content.balance.start.pantry)) {
    const ing = content.ingredientById[id];
    const have = state.pantry.filter((l) => l.ingredient === id).reduce((s, l) => s + l.qty, 0) / ing.unitSize + (incoming[id] ?? 0);
    const need = Math.ceil(target * mul - have - 1e-9);
    if (need > 0) lines.push({ key: id, qty: need });
  }
  let room = shelfRoom(state, content);
  // A bigger shelf carries proportionally more of everything.
  const shelfScale = shelfCap(state, content) / content.market.shelf.slots;
  for (const [id, target] of Object.entries(content.balance.start.goods)) {
    const item = content.itemById[id];
    const have = (state.stock[id] ?? 0) + (incoming[`g-${id}`] ?? 0) * (item.pack ?? 1);
    const wanted = Math.ceil((target * mul * shelfScale - have) / (item.pack ?? 1));
    // Only as many packs as the shelf has room for, counting what is already on the way.
    const perPack = (item.pack ?? 1) * slotsOf(item);
    const fits = perPack > 0 ? Math.floor((room + 1e-9) / perPack) : wanted;
    const need = Math.min(wanted, fits);
    if (need > 0) {
      lines.push({ key: `g-${id}`, qty: need });
      room -= need * perPack;
    }
  }
  while (lines.length > 0) {
    const q = quoteOrder(state, content, supplier, lines, false);
    if (state.bank >= q.total && q.subtotal >= content.supplierById[supplier].minOrder) {
      const r = game.dispatch({ type: 'placeOrder', supplier, lines, express: false });
      // A full shelf takes fewer goods: drop the last line and try again.
      if (!r.ok && r.error === 'shelf_full') {
        lines.pop();
        continue;
      }
      return;
    }
    lines.pop(); // drop the last line and try again
  }
}
