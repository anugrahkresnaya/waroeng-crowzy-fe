// Bills: recurring costs paid from the bank. They are announced a few days ahead; paying late costs a fee and reputation each night.
import type { Content } from './schema';
import type { CommandError, GameEvent, GameState } from './types';

interface BillCtx {
  state: GameState;
  content: Content;
  emit: (event: GameEvent) => void;
}

/** Days past the due date; negative before it. */
export const daysLate = (state: GameState, id: string): number => state.day - (state.bills[id]?.dueDay ?? state.day);

/** Whether the bill is past its grace days, so the late fee applies. */
export function isOverdue(state: GameState, content: Content, id: string): boolean {
  const def = content.balance.bills.find((b) => b.id === id);
  return !!def && daysLate(state, id) > def.grace;
}

/** What paying the bill costs right now. */
export function billTotal(state: GameState, content: Content, id: string): number {
  const def = content.balance.bills.find((b) => b.id === id);
  if (!def) return 0;
  return def.amount + (isOverdue(state, content, id) ? def.lateFee : 0);
}

/** Whether the bill can be paid yet: from `noticeDays` before the due date on. */
export function payable(state: GameState, content: Content, id: string): boolean {
  const def = content.balance.bills.find((b) => b.id === id);
  return !!def && daysLate(state, id) >= -def.noticeDays;
}

/** Overnight, after the day counter moved: remind about bills coming due, and punish the ones that are overdue. */
export function tickBills(ctx: BillCtx): void {
  const { state, content } = ctx;
  for (const def of content.balance.bills) {
    const bill = state.bills[def.id];
    if (!bill) continue;
    const late = daysLate(state, def.id);
    if (late === -def.noticeDays || late === 0) ctx.emit({ type: 'bill_notice', id: def.id, dueDay: bill.dueDay, inDays: -late });
    if (late > def.grace) {
      state.reputation = Math.max(0, Math.min(100, state.reputation + def.rep));
      ctx.emit({ type: 'bill_overdue', id: def.id });
    }
  }
}

export function payBill(ctx: BillCtx, cmd: { id: string }): CommandError | null {
  const { state, content } = ctx;
  const def = content.balance.bills.find((b) => b.id === cmd.id);
  const bill = state.bills[cmd.id];
  if (!def || !bill) return 'unknown_bill';
  if (!payable(state, content, def.id)) return 'not_due_yet';
  const total = billTotal(state, content, def.id);
  if (state.bank < total) return 'insufficient_funds';
  state.bank -= total;
  bill.dueDay = Math.max(bill.dueDay + def.everyDays, state.day + 1);
  ctx.emit({ type: 'bill_paid', id: def.id, total });
  return null;
}
