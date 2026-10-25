// The shelf for goods on sale: a limited number of slots, so the player chooses what to carry. Upgrades add slots.
// Frozen goods live in the freezer and consigned goods sit on the counter, so neither takes a slot.
import type { Content, Item } from './schema';
import type { CommandError, GameEvent, GameState } from './types';

/** Slots one piece of a shelf good takes (0 for goods that do not use the shelf). */
export const slotsOf = (item: Item): number => (item.kind === 'good' && item.perSlot ? 1 / item.perSlot : 0);

/** Total slots on the shelf right now. */
export function shelfCap(state: GameState, content: Content): number {
  const { slots, upgrades } = content.market.shelf;
  return state.shelfLevel > 0 ? upgrades[Math.min(state.shelfLevel, upgrades.length) - 1].slots : slots;
}

/** Slots taken by the goods in stock. */
export function shelfUsed(state: GameState, content: Content): number {
  let used = 0;
  for (const item of content.items) used += (state.stock[item.id] ?? 0) * slotsOf(item);
  return used;
}

/** Slots the goods in orders still on their way will need. */
export function shelfPending(state: GameState, content: Content): number {
  let slots = 0;
  for (const o of state.orders) {
    if (o.status !== 'transit') continue;
    slots += shelfNeeded(content, o.lines);
  }
  return slots;
}

/** Slots a list of purchase lines (packs of goods) would take. */
export function shelfNeeded(content: Content, lines: Array<{ key: string; qty: number }>): number {
  let slots = 0;
  for (const l of lines) {
    const p = content.productByKey[l.key];
    if (p?.kind !== 'good') continue;
    const item = content.itemById[p.id];
    slots += l.qty * (item.pack ?? 1) * slotsOf(item);
  }
  return slots;
}

/** Slots free for new goods, counting what is already on the way. */
export const shelfRoom = (state: GameState, content: Content): number => Math.max(0, shelfCap(state, content) - shelfUsed(state, content) - shelfPending(state, content));

/** The next upgrade on offer, or null when the shelf is as big as it gets. */
export function nextShelf(state: GameState, content: Content) {
  return content.market.shelf.upgrades[state.shelfLevel] ?? null;
}

/** Buys the next shelf upgrade from the bank. */
export function buyShelf(ctx: { state: GameState; content: Content; emit: (e: GameEvent) => void }): CommandError | null {
  const { state, content } = ctx;
  const next = nextShelf(state, content);
  if (!next) return 'already_owned';
  if (state.bank < next.price) return 'insufficient_funds';
  state.bank -= next.price;
  state.shelfLevel++;
  ctx.emit({ type: 'shelf_bought', price: next.price, slots: next.slots });
  return null;
}
