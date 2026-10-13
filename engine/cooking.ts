// Cooking to order: a dish goes on a burner and the player plates it when it is done.
// The burner runs on game time, so plating at the same tick always gives the same result and a run replays exactly.
import { consume, dishNeeds, portionsLeft } from './market';
import type { Content, Item } from './schema';
import type { Burner, Command, CommandError, Customer, GameEvent, GameState, Quality } from './types';

interface CookCtx {
  state: GameState;
  content: Content;
  emit: (event: GameEvent) => void;
}

type Err = CommandError | null;

/** Extra minutes of just-right window the player has earned by practice. */
export function practiceBonus(state: GameState, content: Content, itemId: string): number {
  const c = content.balance.cooking;
  return Math.min(c.maxPractice, Math.floor((state.skill[itemId] ?? 0) / c.practicePerMinute));
}

/** The minutes, counted from the start, in which plating gives a perfect result. */
export function justRight(state: GameState, content: Content, item: Item): { from: number; to: number } {
  const cook = item.cook!;
  const window = cook.window + practiceBonus(state, content, item.id);
  return { from: cook.minutes - window, to: cook.minutes + window };
}

/** Minutes an auto-cook burner needs. */
export const autoMinutes = (content: Content, item: Item): number => Math.ceil(item.cook!.minutes * content.balance.cooking.autoMul);

export function qualityAt(state: GameState, content: Content, item: Item, elapsed: number): Quality {
  const { from, to } = justRight(state, content, item);
  if (elapsed < from) return 'kurang';
  return elapsed <= to ? 'pas' : 'gosong';
}

/** Portions of this item the customer still needs cooked: ordered, minus plated, minus on the stove for them. */
export function stillToCook(state: GameState, c: Customer, itemId: string): number {
  const ordered = c.order.find((l) => l.itemId === itemId)?.qty ?? 0;
  const onStove = state.burners.filter((b) => b && b.customerId === c.id && b.item === itemId).length;
  return ordered - (c.tray[itemId] ?? 0) - onStove;
}

export function startCook(ctx: CookCtx, c: Customer, cmd: Extract<Command, { type: 'startCook' }>): Err {
  const { state, content } = ctx;
  if (c.stage !== 'ordering') return 'wrong_stage';
  const item = content.itemById[cmd.item];
  if (!item) return 'unknown_item';
  if (!item.cook) return 'not_cooked_to_order';
  if (!c.order.some((l) => l.itemId === item.id)) return 'not_in_order';
  if (stillToCook(state, c, item.id) <= 0) return 'already_cooked';
  const slot = state.burners.findIndex((b) => b === null);
  if (slot < 0) return 'no_burner';
  if (portionsLeft(state, content, item.id) <= 0) return 'out_of_stock';
  let cost = 0;
  for (const [ing, need] of Object.entries(dishNeeds(state, content, item))) cost += consume(state, ing, need).cost;
  state.burners[slot] = { item: item.id, customerId: c.id, startedAt: state.tick, auto: cmd.auto, cost };
  return null;
}

/** Takes the dish off the burner and puts it on its customer's tray. */
function finish(ctx: CookCtx, slot: number, quality: Quality): void {
  const { state } = ctx;
  const burner = state.burners[slot] as Burner;
  state.burners[slot] = null;
  const c = state.line.find((x) => x.id === burner.customerId);
  if (!c) {
    state.stats.waste += burner.cost;
    ctx.emit({ type: 'burner_wasted', item: burner.item });
    return;
  }
  c.tray[burner.item] = (c.tray[burner.item] ?? 0) + 1;
  (c.cooked[burner.item] ??= []).push({ quality, cost: burner.cost });
  state.stats.cooking[quality]++;
  if (quality === 'pas') state.skill[burner.item] = (state.skill[burner.item] ?? 0) + 1;
  ctx.emit({ type: 'plated', item: burner.item, quality });
}

export function plate(ctx: CookCtx, cmd: Extract<Command, { type: 'plate' }>): Err {
  const { state, content } = ctx;
  if (!Number.isInteger(cmd.burner) || cmd.burner < 0 || cmd.burner >= state.burners.length) return 'no_such_burner';
  const burner = state.burners[cmd.burner];
  if (!burner) return 'nothing_to_cook';
  if (burner.auto) return 'auto_cooking';
  finish(ctx, cmd.burner, qualityAt(state, content, content.itemById[burner.item], state.tick - burner.startedAt));
  return null;
}

/** Called every game minute: auto-cook burners plate themselves when done. */
export function tickBurners(ctx: CookCtx): void {
  const { state, content } = ctx;
  state.burners.forEach((burner, slot) => {
    if (!burner?.auto) return;
    if (state.tick - burner.startedAt >= autoMinutes(content, content.itemById[burner.item])) finish(ctx, slot, 'biasa');
  });
}

/** Clears what a customer had on the stove when they leave or drop an item. The food is wasted. */
export function dropBurners(ctx: CookCtx, customerId: number, itemId?: string): void {
  const { state } = ctx;
  state.burners.forEach((b, slot) => {
    if (!b || b.customerId !== customerId || (itemId && b.item !== itemId)) return;
    state.stats.waste += b.cost;
    state.burners[slot] = null;
    ctx.emit({ type: 'burner_wasted', item: b.item });
  });
}

export function clearBurners(ctx: CookCtx): void {
  for (const b of [...new Set(ctx.state.burners.filter((x): x is Burner => x !== null).map((x) => x.customerId))]) dropBurners(ctx, b);
}

/** Throws away the cooked portions of an item that are on a customer's tray (they declined it or left). */
export function wasteCooked(ctx: CookCtx, c: Customer, itemId?: string): void {
  for (const [id, portions] of Object.entries(c.cooked)) {
    if (itemId && id !== itemId) continue;
    for (const p of portions) ctx.state.stats.waste += p.cost;
    delete c.cooked[id];
  }
}
