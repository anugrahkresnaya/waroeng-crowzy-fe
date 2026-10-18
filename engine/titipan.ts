// Titipan: goods taken on consignment from a neighbour. They are taken before opening, sold from the shelf, and at closing what is left
// goes back. The neighbour is owed only for what sold. Selling what you take builds trust, and trust raises how much you can take.
import type { Content } from './schema';
import type { CommandError, GameEvent, GameState } from './types';

interface TitipanCtx {
  state: GameState;
  content: Content;
  emit: (event: GameEvent) => void;
}

/** From the day the neighbour offers it (a stand-in for the story unlock after chapter 2). */
export const titipanUnlocked = (state: GameState, content: Content): boolean => state.day >= content.balance.titipan.unlockDay;

/** The trust level the player has reached, with what it allows and what is needed for the next one. */
export function titipanLevel(state: GameState, content: Content): { level: number; max: number; costMul: number; next: number | null } {
  const levels = content.balance.titipan.levels;
  let at = 0;
  for (let i = 0; i < levels.length; i++) if (state.titipan.relation >= levels[i].relation) at = i;
  return { level: at + 1, max: levels[at].max, costMul: levels[at].costMul, next: levels[at + 1]?.relation ?? null };
}

/** What the neighbour is owed for one piece of this item at today's trust level. */
export function titipanCost(state: GameState, content: Content, itemId: string): number {
  const item = content.itemById[itemId];
  return Math.round((item.buyPrice ?? 0) * titipanLevel(state, content).costMul);
}

/** How many more of an item can be taken today. */
export const titipanRoom = (state: GameState, content: Content, itemId: string): number =>
  Math.max(0, titipanLevel(state, content).max - (state.titipan.taken[itemId] ?? 0));

/** Why nothing can be taken right now, if so. */
export function titipanBlocked(state: GameState, content: Content): CommandError | null {
  if (!titipanUnlocked(state, content)) return 'not_unlocked';
  if (state.phase !== 'idle') return 'wrong_phase';
  if (state.titipan.owed > 0) return 'owes_neighbor';
  if (state.preOpenUsed + content.balance.titipan.minutes > content.balance.preOpenMinutes) return 'no_time';
  return null;
}

/** Picks up pieces of a consigned item from the neighbour, before opening. */
export function takeTitipan(ctx: TitipanCtx, cmd: { item: string; qty: number }): CommandError | null {
  const { state, content } = ctx;
  const item = content.itemById[cmd.item];
  if (!item) return 'unknown_item';
  if (!item.consign) return 'not_consigned';
  if (!Number.isInteger(cmd.qty) || cmd.qty < 1) return 'invalid_quantity';
  const blocked = titipanBlocked(state, content);
  if (blocked) return blocked;
  if (cmd.qty > titipanRoom(state, content, item.id)) return 'titipan_full';
  state.preOpenUsed += content.balance.titipan.minutes;
  state.titipan.taken[item.id] = (state.titipan.taken[item.id] ?? 0) + cmd.qty;
  state.stock[item.id] = (state.stock[item.id] ?? 0) + cmd.qty;
  state.goodsCost[item.id] = titipanCost(state, content, item.id); // what each one sold costs, so the day's profit is the margin
  ctx.emit({ type: 'titipan_taken', item: item.id, qty: cmd.qty });
  return null;
}

/** At closing: unsold pieces go back, the neighbour is paid for what sold (from the bank, or it is owed), and trust moves. */
export function settleTitipan(ctx: TitipanCtx): void {
  const { state, content } = ctx;
  const taken = Object.entries(state.titipan.taken);
  if (taken.length === 0) return;
  const t = content.balance.titipan;
  let pieces = 0;
  let sold = 0;
  let returned = 0;
  let due = 0;
  for (const [id, qty] of taken) {
    const left = Math.min(qty, state.stock[id] ?? 0);
    pieces += qty;
    sold += qty - left;
    returned += left;
    due += (qty - left) * (state.goodsCost[id] ?? 0);
    state.stock[id] = 0;
  }
  state.titipan.taken = {};
  state.stats.titipanSold += sold;
  state.stats.titipanReturned += returned;
  const share = pieces > 0 ? sold / pieces : 0;
  let relation = 0;
  if (share >= t.happyShare) relation = 1;
  else if (share < t.unhappyShare && pieces >= t.unhappyMinTaken) relation = -1;
  state.titipan.relation = Math.max(0, Math.min(100, state.titipan.relation + relation));
  state.titipan.owed += due;
  const pay = Math.min(state.bank, state.titipan.owed);
  state.bank -= pay;
  state.titipan.owed -= pay;
  state.stats.titipanPaid += pay;
  ctx.emit({ type: 'titipan_settled', sold, returned, paid: pay, owed: state.titipan.owed, relation });
}

/** Pays off what is still owed to the neighbour, from the bank. */
export function payNeighbor(ctx: TitipanCtx): CommandError | null {
  const { state } = ctx;
  if (state.titipan.owed <= 0) return 'nothing_owed';
  if (state.bank < state.titipan.owed) return 'insufficient_funds';
  const amount = state.titipan.owed;
  state.bank -= amount;
  state.titipan.owed = 0;
  ctx.emit({ type: 'titipan_paid', amount });
  return null;
}
