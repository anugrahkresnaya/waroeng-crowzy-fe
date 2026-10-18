// The phone: its battery only drains while the power is out, data is spent by the market app and QRIS checks, and during a long
// PLN cut the QRIS signal fades. When a payment cannot be checked the player takes the customer's word or refuses; the truth comes out later.
import { makeChange, removePieces } from './money';
import { errand, errandBlocked, plnOff, powerOff } from './outage';
import type { Content } from './schema';
import type { CommandError, GameEvent, GameState } from './types';
import type { Rng } from './rng';

interface PhoneCtx {
  state: GameState;
  content: Content;
  rng: Rng;
  emit: (event: GameEvent) => void;
}

export type Signal = 'good' | 'slow' | 'down';

/** QRIS signal: normal while the towers' backup lasts into a PLN cut, then slow, then down. */
export function signalOf(state: GameState, content: Content): Signal {
  const o = state.outage;
  if (!o || !plnOff(state)) return 'good';
  const s = content.balance.phone.signal;
  const elapsed = state.minute - o.from;
  if (elapsed < s.backupMinutes) return 'good';
  return elapsed < s.backupMinutes + s.slowMinutes ? 'slow' : 'down';
}

export const phoneAlive = (state: GameState): boolean => state.phone.battery > 1e-9 || (state.phone.powerbank ?? 0) > 1e-9;

/** Whether the player can check a QRIS payment now, and what is in the way if not. */
export function qrisCheck(state: GameState, content: Content): { ok: boolean; reason: 'battery' | 'data' | 'signal' | null; signal: Signal } {
  const signal = signalOf(state, content);
  if (!phoneAlive(state)) return { ok: false, reason: 'battery', signal };
  if (state.phone.data + 1e-9 < content.balance.phone.dataCosts.qris) return { ok: false, reason: 'data', signal };
  if (signal === 'down') return { ok: false, reason: 'signal', signal };
  return { ok: true, reason: null, signal };
}

/** What stops the market app working, if anything. */
export function phoneGate(state: GameState, content: Content, mb: number): CommandError | null {
  if (!phoneAlive(state)) return 'phone_dead';
  if (state.phone.data + 1e-9 < mb) return 'no_data';
  return null;
}

/** Takes battery out of the phone, the main battery first and then the powerbank. */
function drain(ctx: Pick<PhoneCtx, 'state' | 'content' | 'emit'>, amount: number): void {
  const { state, content } = ctx;
  const p = state.phone;
  const before = p.battery;
  const fromBattery = Math.min(p.battery, amount);
  p.battery -= fromBattery;
  if (p.powerbank !== null) p.powerbank = Math.max(0, p.powerbank - (amount - fromBattery));
  const low = content.balance.phone.lowBattery;
  if (before >= low && p.battery < low) ctx.emit({ type: 'phone_low', battery: Math.round(p.battery) });
}

/** One phone action: data goes, and without power so does a little battery. Call once the action is accepted. */
export function spendPhone(ctx: Pick<PhoneCtx, 'state' | 'content' | 'emit'>, mb: number): void {
  const { state, content } = ctx;
  const before = state.phone.data;
  state.phone.data = Math.max(0, before - mb);
  if (before >= content.balance.phone.lowData && state.phone.data < content.balance.phone.lowData) ctx.emit({ type: 'data_low', mb: Math.round(state.phone.data) });
  if (powerOff(state)) drain(ctx, content.balance.phone.actionCost);
}

/** Money that reached the bank for the payments taken on trust, and what turned out to be fake. */
export function settleQris(ctx: PhoneCtx, countStats: boolean): void {
  const { state, content } = ctx;
  if (state.qrisPending.length === 0) return;
  let received = 0;
  let lost = 0;
  for (const p of state.qrisPending) {
    if (p.fake) {
      lost += p.amount;
      continue;
    }
    const fee = Math.ceil((p.amount * content.balance.qrisFeeBp) / 10000);
    state.bank += p.amount - fee;
    received += p.amount - fee;
    if (countStats) {
      state.stats.qrisRevenue += p.amount - fee;
      state.stats.qrisFees += fee;
    }
  }
  if (countStats) state.stats.qrisFake += lost;
  state.qrisPending = [];
  ctx.emit({ type: 'qris_settled', received, lost });
}

/** Every open minute: the battery drains or charges with the power, and payments wait to be checked again. */
export function tickPhone(ctx: PhoneCtx): void {
  const { state, content } = ctx;
  const c = content.balance.phone;
  if (powerOff(state)) drain(ctx, c.drainPerMinute);
  else {
    state.phone.battery = Math.min(100, state.phone.battery + c.chargePerMinute);
    if (state.phone.powerbank !== null) state.phone.powerbank = Math.min(c.powerbank.capacity, state.phone.powerbank + c.chargePerMinute);
  }
  if (state.qrisPending.length > 0 && qrisCheck(state, content).ok) settleQris(ctx, true);
}

/** Bedtime: a phone left on a working charger is full by morning, and the bank statement shows what really arrived. */
export function phoneNight(ctx: PhoneCtx): void {
  const { state, content } = ctx;
  if (!(state.token <= 0)) {
    state.phone.battery = 100;
    if (state.phone.powerbank !== null) state.phone.powerbank = content.balance.phone.powerbank.capacity;
  }
  settleQris(ctx, false);
}

/** A data pack, paid for in cash from the drawer at the counter. */
export function buyData(ctx: PhoneCtx, cmd: { pack: number }): CommandError | null {
  const { state, content } = ctx;
  const pack = Number.isInteger(cmd.pack) ? content.balance.phone.dataPacks[cmd.pack] : undefined;
  if (!pack) return 'invalid_amount';
  const cash = makeChange(pack.price, state.drawer);
  if (!cash) return 'not_in_drawer';
  removePieces(state.drawer, cash);
  state.phone.data += pack.mb;
  ctx.emit({ type: 'data_bought', mb: pack.mb, price: pack.price });
  return null;
}

/** A powerbank, bought once, keeps the phone alive through a long cut. */
export function buyPowerbank(ctx: PhoneCtx): CommandError | null {
  const { state, content } = ctx;
  const pb = content.balance.phone.powerbank;
  if (state.phone.powerbank !== null) return 'already_owned';
  const blocked = errandBlocked(state, content);
  if (blocked) return blocked;
  if (state.bank < pb.price) return 'insufficient_funds';
  errand(state, content);
  state.bank -= pb.price;
  state.phone.powerbank = pb.capacity;
  ctx.emit({ type: 'powerbank_bought', price: pb.price });
  return null;
}
