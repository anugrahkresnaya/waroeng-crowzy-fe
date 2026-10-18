// The kitchen: batch dishes are cooked ahead onto the display, sold from there, and what is left at night is dealt with.
import { gasShort } from './gas';
import { consume, dishNeeds, displayPortions, ingredientQty, sellPrice, takeFromDisplay } from './market';
import { addPieces, exactPieces } from './money';
import type { Rng } from './rng';
import type { Content, Item } from './schema';
import type { Command, CommandError, DisplayBatch, GameEvent, GameState, LeftoverChoice } from './types';

interface KitchenCtx {
  state: GameState;
  content: Content;
  rng: Rng;
  emit: (event: GameEvent) => void;
}

type Err = CommandError | null;

/** Minutes since day 0, the clock the display uses to tell when food went stale. */
export const absoluteMinute = (state: GameState): number => state.day * 1440 + state.minute;

export const isBatchDish = (item: Item): boolean => item.kind === 'dish' && !!item.batch;

/** Throws out batches that sat on the display too long. Returns the cost of what was thrown out. */
export function sweepDisplay(ctx: KitchenCtx): void {
  const { state, content } = ctx;
  const now = absoluteMinute(state);
  for (const [id, batches] of Object.entries(state.display)) {
    const fresh = content.itemById[id]?.batch?.freshMinutes ?? 0;
    const keep: DisplayBatch[] = [];
    let gone = 0;
    for (const b of batches) {
      if (now - b.cookedAt >= fresh) {
        gone += b.qty;
        state.stats.waste += b.qty * b.unitCost;
      } else keep.push(b);
    }
    if (gone > 0) ctx.emit({ type: 'went_stale', item: id, portions: gone });
    if (keep.length > 0) state.display[id] = keep;
    else delete state.display[id];
  }
}

/** Throws away everything left, as happens overnight. */
export function clearDisplay(ctx: KitchenCtx): void {
  const { state } = ctx;
  for (const [id, batches] of Object.entries(state.display)) {
    let gone = 0;
    for (const b of batches) {
      gone += b.qty;
      state.stats.waste += b.qty * b.unitCost;
    }
    ctx.emit({ type: 'went_stale', item: id, portions: gone });
  }
  state.display = {};
}

/** How many whole batches the pantry can make right now. */
export function batchesPossible(state: GameState, content: Content, item: Item): number {
  if (!item.batch) return 0;
  let most = Infinity;
  for (const [ing, need] of Object.entries(dishNeeds(state, content, item))) {
    most = Math.min(most, Math.floor((ingredientQty(state, ing) + 1e-9) / (need * item.batch.portions)));
  }
  return Number.isFinite(most) ? Math.max(0, most) : 0;
}

export function cookBatch(ctx: KitchenCtx, cmd: Extract<Command, { type: 'cookBatch' }>): Err {
  const { state, content } = ctx;
  const b = content.balance;
  if (state.phase !== 'idle' && state.phase !== 'open') return 'wrong_phase';
  const item = content.itemById[cmd.item];
  if (!item) return 'unknown_item';
  if (!item.batch) return 'not_a_batch_dish';
  if (!Number.isInteger(cmd.batches) || cmd.batches < 1 || cmd.batches > 20) return 'invalid_quantity';
  const minutes = item.batch.minutes * cmd.batches;
  if (state.phase === 'idle') {
    if (state.preOpenUsed + minutes > b.preOpenMinutes) return 'no_time';
  } else {
    if (state.busyUntil > 0) return 'busy';
    if (!state.shelfReady) return 'shelves_not_ready';
  }
  if (gasShort(state, content, item, item.batch.portions * cmd.batches)) return 'out_of_gas';
  if (batchesPossible(state, content, item) < cmd.batches) return 'missing_ingredients';
  const portions = item.batch.portions * cmd.batches;
  let cost = 0;
  for (const [ing, need] of Object.entries(dishNeeds(state, content, item))) cost += consume(state, ing, need * portions).cost;
  // Food cooked before opening is ready when the doors open; food cooked while open is ready when the cook is done.
  const readyAt = state.phase === 'idle' ? state.day * 1440 + b.openMinute : absoluteMinute(state) + minutes;
  (state.display[item.id] ??= []).push({ qty: portions, cookedAt: readyAt, unitCost: cost / portions });
  if (state.phase === 'idle') state.preOpenUsed += minutes;
  else state.busyUntil = state.tick + minutes;
  ctx.emit({ type: 'cooked', item: item.id, portions });
  return null;
}

const CHOICES: LeftoverChoice[] = ['obral', 'eat', 'give', 'trash'];

export function handleLeftover(ctx: KitchenCtx, cmd: Extract<Command, { type: 'handleLeftover' }>): Err {
  const { state, content } = ctx;
  const l = content.balance.leftovers;
  if (state.phase !== 'ended' && state.phase !== 'night' && state.phase !== 'bed') return 'wrong_phase';
  const item = content.itemById[cmd.item];
  if (!item) return 'unknown_item';
  if (!item.batch) return 'not_a_batch_dish';
  if (!CHOICES.includes(cmd.choice)) return 'invalid_choice';
  const qty = displayPortions(state, item.id);
  if (qty <= 0) return 'no_leftovers';
  const cost = takeFromDisplay(state, item.id, qty);
  switch (cmd.choice) {
    case 'obral': {
      const money = Math.round((qty * sellPrice(state, item) * l.obralMul) / 500) * 500;
      addPieces(state.drawer, exactPieces(money) ?? {});
      state.stats.obralRevenue += money;
      break;
    }
    case 'eat':
      state.hunger = Math.max(0, state.hunger - qty * l.eatHunger);
      break;
    case 'give': {
      const gain = Math.min(qty * l.giveRep, Math.max(0, l.giveRepMax - state.stats.givenRep));
      state.stats.givenRep += gain;
      state.reputation = Math.min(100, state.reputation + gain);
      break;
    }
    case 'trash':
      state.stats.waste += cost;
      break;
  }
  ctx.emit({ type: 'leftover_handled', item: item.id, choice: cmd.choice, portions: qty });
  return null;
}
