// The freezer: slots shared by frozen ingredients and frozen goods, and what a long power cut does to them.
import type { Content, Item } from './schema';
import type { GameState } from './types';

/** Slots one piece of a frozen good takes. */
export const slotsPerPiece = (item: Item): number => item.frozen?.slots ?? 0;

/** Slots in use: frozen ingredient lots (a sold unit is a slot) plus frozen goods in stock. */
export function freezerUsed(state: GameState, content: Content): number {
  let used = 0;
  for (const l of state.pantry) if (l.stored === 'freezer') used += l.qty / content.ingredientById[l.ingredient].unitSize;
  for (const item of content.items) if (item.frozen) used += (state.stock[item.id] ?? 0) * item.frozen.slots;
  return used;
}

/** Slots free for new frozen goods, or 0 without a freezer. */
export const freezerRoom = (state: GameState, content: Content): number => (state.freezer ? Math.max(0, content.market.freezerCapacity - freezerUsed(state, content)) : 0);

/** The slots a purchase of frozen goods needs, in pieces times slots. */
export function frozenSlotsNeeded(content: Content, lines: Array<{ key: string; qty: number }>): number {
  let slots = 0;
  for (const l of lines) {
    const p = content.productByKey[l.key];
    if (p?.kind !== 'good') continue;
    const item = content.itemById[p.id];
    if (item.frozen) slots += l.qty * (item.pack ?? 1) * item.frozen.slots;
  }
  return slots;
}

/** How long, in hours, the freezer keeps its contents in a cut: a day when well filled, much less when it is mostly empty. */
export function freezerHoldHours(state: GameState, content: Content): number {
  const c = content.balance.outage;
  const filled = freezerUsed(state, content) / content.market.freezerCapacity;
  return filled >= c.freezerWellFilled ? c.freezerHoldHours : c.freezerPartialHours;
}

/** True if the freezer lost its cold during the day that just ended: a PLN cut (ice helps) or an empty token lasted longer than it holds. */
export function freezerFailedOvernight(state: GameState, content: Content): boolean {
  if (!state.freezer) return false;
  const hold = freezerHoldHours(state, content);
  const o = state.outage;
  const ice = o?.ice ? content.balance.outage.ice.holdHours : 0;
  if (o && o.day === state.day - 1 && o.hours > hold + ice) return true;
  return state.tokenOffMinutes > hold * 60;
}
