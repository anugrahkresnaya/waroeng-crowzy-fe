// Gas: dishes burn LPG from the pantry as they are cooked. When the stove runs dry the player can buy a tank next door,
// which costs more than the market and a few minutes away from the counter.
import { addLot, assignStorage, dishNeeds, ingredientQty, marketPrice, roundPrice } from './market';
import type { Content, Item } from './schema';
import type { CommandError, GameEvent, GameState } from './types';

interface GasCtx {
  state: GameState;
  content: Content;
  emit: (event: GameEvent) => void;
}

const GAS = 'lpg';

/** Flames left in the pantry, in the ingredient's base unit. */
export const gasFlames = (state: GameState): number => ingredientQty(state, GAS);

/** Tanks left, as a fraction (2.5 means two full tanks and half of a third). */
export function gasTanks(state: GameState, content: Content): number {
  return gasFlames(state) / content.ingredientById[GAS].unitSize;
}

/** True when the dish needs more gas than is left for `portions` portions. Other shortages are not gas. */
export function gasShort(state: GameState, content: Content, item: Item, portions = 1): boolean {
  const need = dishNeeds(state, content, item)[GAS] ?? 0;
  return need > 0 && gasFlames(state) + 1e-9 < need * portions;
}

/** What a tank costs next door right now. */
export const gasPrice = (state: GameState, content: Content): number =>
  roundPrice(marketPrice(state, GAS) * content.balance.gas.nearbyMarkup);

/** Buys one tank from a neighbour: paid from the bank, in the pantry at once, and it takes time. */
export function buyGas(ctx: GasCtx): CommandError | null {
  const { state, content } = ctx;
  const g = content.balance.gas;
  if (state.phase !== 'idle' && state.phase !== 'open') return 'wrong_phase';
  if (state.phase === 'open' && state.busyUntil > 0) return 'busy';
  if (state.phase === 'idle' && state.preOpenUsed + g.nearbyMinutes > content.balance.preOpenMinutes) return 'no_time';
  const price = gasPrice(state, content);
  if (state.bank < price) return 'insufficient_funds';
  state.bank -= price;
  const ing = content.ingredientById[GAS];
  addLot(state, GAS, ing.unitSize, price / ing.unitSize);
  assignStorage(state, content);
  if (state.phase === 'idle') state.preOpenUsed += g.nearbyMinutes;
  else state.busyUntil = state.tick + g.nearbyMinutes;
  ctx.emit({ type: 'gas_bought', price });
  return null;
}
