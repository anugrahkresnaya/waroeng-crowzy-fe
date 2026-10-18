// Power cuts: a cut is rolled overnight, sometimes announced a day ahead, and takes the fridge, the ice and the light with it.
// Ice and a lantern are the player's answers; what the fridge loses shows up in the morning's spoilage.
import type { Rng } from './rng';
import type { Content, Item } from './schema';
import type { CommandError, GameEvent, GameState, Outage } from './types';

interface OutageCtx {
  state: GameState;
  content: Content;
  rng: Rng;
  emit: (event: GameEvent) => void;
}

const ICE = 'es-batu';

/** The minute a cut ends, never past midnight. */
export const outageEnd = (o: Outage): number => Math.min(1440, o.from + o.hours * 60);

/** True while a PLN cut is on right now. */
export function plnOff(state: GameState): boolean {
  const o = state.outage;
  return !!o && o.day === state.day && state.minute >= o.from && state.minute < outageEnd(o);
}

/** True when the prepaid token has run out: the player's own doing. */
export const tokenEmpty = (state: GameState): boolean => state.token <= 0;

/** True while the power is out right now, from a PLN cut or an empty token. */
export const powerOff = (state: GameState): boolean => plnOff(state) || tokenEmpty(state);

/** The cut that is today and has not ended, so ice can still help. */
export function outageToday(state: GameState): Outage | null {
  const o = state.outage;
  return o && o.day === state.day && state.minute < outageEnd(o) ? o : null;
}

/** How many customers still come: fewer in the dark, a few more back with a lantern. */
export function arrivalMul(state: GameState, content: Content): number {
  const c = content.balance.outage;
  if (!powerOff(state) || state.minute < c.darkFrom) return 1;
  return state.lantern ? c.lantern.lanternMul : c.lantern.darkMul;
}

/** True when the dish needs ice and the power is out with no ice bought. */
export function iceMissing(state: GameState, item: Item): boolean {
  return powerOff(state) && !state.outage?.ice && (item.recipe?.[ICE] ?? 0) > 0;
}

/** True if the fridge could not hold on through the cut that filled `day`, so what it kept is only as good as room-temperature food. */
export function fridgeFailed(state: GameState, content: Content, day: number): boolean {
  const o = state.outage;
  if (!o || o.day !== day) return false;
  const c = content.balance.outage;
  return o.hours > c.fridgeHoldHours + (o.ice ? c.ice.holdHours : 0);
}

/** True if the fridge sat without power too long today because the token was empty. */
export const tokenFridgeFailed = (state: GameState, content: Content): boolean => state.tokenOffMinutes >= content.balance.outage.fridgeHoldHours * 60;

/** Overnight: the old cut is over, and a new one may be coming (today without warning, or tomorrow with it). */
export function rollOutage(ctx: OutageCtx): void {
  const { state, content, rng } = ctx;
  const c = content.balance.outage;
  if (state.outage && state.outage.day < state.day) state.outage = null;
  if (state.outage || state.day < c.fromDay || !rng.chance(c.chancePerDay)) return;
  const known = rng.chance(c.noticeChance);
  const from = c.starts[rng.int(0, c.starts.length - 1)];
  const hours = c.hours[rng.int(0, c.hours.length - 1)];
  state.outage = { day: known ? state.day + 1 : state.day, from, hours, known, ice: false };
  if (known) ctx.emit({ type: 'outage_notice', from, hours });
}

/** Called every game minute while open: tells the player when the lights go out and come back. */
export function tickPower(ctx: Pick<OutageCtx, 'state' | 'emit'>): void {
  const o = ctx.state.outage;
  if (!o || o.day !== ctx.state.day) return;
  if (ctx.state.minute === o.from) ctx.emit({ type: 'power_out', hours: o.hours });
  else if (ctx.state.minute === outageEnd(o)) ctx.emit({ type: 'power_back' });
}

/** Takes `amount` off the token and tells the player when it runs low or out. */
function burnToken(ctx: Pick<OutageCtx, 'state' | 'content' | 'emit'>, amount: number): void {
  const { state, content } = ctx;
  if (amount <= 0 || state.token <= 0) return;
  const before = state.token;
  state.token = Math.max(0, state.token - amount);
  if (state.token <= 0) ctx.emit({ type: 'token_out' });
  else if (before >= content.balance.token.lowMark && state.token < content.balance.token.lowMark) ctx.emit({ type: 'token_low', token: state.token });
}

/** Every open minute: the shop uses power, unless a PLN cut has it off, and an empty token keeps the fridge warm. */
export function tickToken(ctx: Pick<OutageCtx, 'state' | 'content' | 'emit'>): void {
  const { state, content } = ctx;
  if (plnOff(state)) return;
  if (tokenEmpty(state)) state.tokenOffMinutes++;
  else burnToken(ctx, content.balance.token.openPerMinute);
}

/** Bedtime: an empty token means the fridge spent the night warm. Call before the overnight spoilage. */
export function tokenOvernight(state: GameState, content: Content): void {
  if (tokenEmpty(state)) state.tokenOffMinutes += content.balance.token.overnightMinutes;
}

/** After the overnight spoilage: the fridge and lights burned a little credit, and a new day starts with a clean count. */
export function tokenNewDay(ctx: Pick<OutageCtx, 'state' | 'content' | 'emit'>): void {
  ctx.state.tokenOffMinutes = 0;
  burnToken(ctx, ctx.content.balance.token.perDay);
}

/** Tops the token up from the bank with a pack, for a fee. Power is back at once. */
export function buyToken(ctx: OutageCtx, cmd: { amount: number }): CommandError | null {
  const { state, content } = ctx;
  const t = content.balance.token;
  if (!t.packs.includes(cmd.amount)) return 'invalid_amount';
  if (state.bank < cmd.amount + t.fee) return 'insufficient_funds';
  state.bank -= cmd.amount + t.fee;
  state.token += cmd.amount;
  ctx.emit({ type: 'token_bought', amount: cmd.amount, fee: t.fee });
  return null;
}

/** Time away for an errand: pre-open minutes before opening, a busy counter while open, free otherwise. */
function errand(state: GameState, content: Content): CommandError | null {
  const minutes = content.balance.outage.errandMinutes;
  if (state.phase === 'open') {
    if (state.busyUntil > 0) return 'busy';
    state.busyUntil = state.tick + minutes;
  } else if (state.phase === 'idle') {
    if (state.preOpenUsed + minutes > content.balance.preOpenMinutes) return 'no_time';
    state.preOpenUsed += minutes;
  } else if (state.phase !== 'ended' && state.phase !== 'night' && state.phase !== 'bed') return 'wrong_phase';
  return null;
}

/** Whether an errand is possible right now, without doing it. */
function errandBlocked(state: GameState, content: Content): CommandError | null {
  if (state.phase === 'open') return state.busyUntil > 0 ? 'busy' : null;
  if (state.phase === 'idle') return state.preOpenUsed + content.balance.outage.errandMinutes > content.balance.preOpenMinutes ? 'no_time' : null;
  return state.phase === 'ended' || state.phase === 'night' || state.phase === 'bed' ? null : 'wrong_phase';
}

/** Ice from the neighbour: cold drinks work again and the fridge holds on longer. Only on the day of the cut. */
export function buyIce(ctx: OutageCtx): CommandError | null {
  const { state, content } = ctx;
  const o = outageToday(state);
  if (!o) return 'no_outage';
  if (o.ice) return 'already_owned';
  const price = content.balance.outage.ice.price;
  const blocked = errandBlocked(state, content);
  if (blocked) return blocked;
  if (state.bank < price) return 'insufficient_funds';
  errand(state, content);
  state.bank -= price;
  o.ice = true;
  ctx.emit({ type: 'ice_bought', price });
  return null;
}

/** A lantern, bought once, keeps the evening customers coming when the lights are out. */
export function buyLantern(ctx: OutageCtx): CommandError | null {
  const { state, content } = ctx;
  if (state.lantern) return 'already_owned';
  const price = content.balance.outage.lantern.price;
  const blocked = errandBlocked(state, content);
  if (blocked) return blocked;
  if (state.bank < price) return 'insufficient_funds';
  errand(state, content);
  state.bank -= price;
  state.lantern = true;
  ctx.emit({ type: 'lantern_bought', price });
  return null;
}

/** What a closed fridge would lose, for the overnight spoilage: lots stored in the fridge age like room-temperature stock. */
export function fridgeSpoilsAsRoom(state: GameState, content: Content): boolean {
  return fridgeFailed(state, content, state.day - 1) || tokenFridgeFailed(state, content);
}
