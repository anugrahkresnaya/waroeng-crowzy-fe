import { describe, expect, it } from 'vitest';
import { billTotal, daysLate, isOverdue, payable } from './bills';
import { content } from './content';
import { Game } from './game';
import { arrivalMul, powerOff, tokenEmpty } from './outage';
import { replay } from './replay';
import { kitchenContent, passDay } from './testing/fixtures';

const t = content.balance.token;
const rent = content.balance.bills[0];

const idle = () => new Game(kitchenContent(), { seed: 1 });
function openGame() {
  const g = idle();
  g.dispatch({ type: 'open', prepared: true });
  return g;
}
const types = (events: Array<{ type: string }>) => events.map((e) => e.type);

describe('the electricity token', () => {
  it('starts with credit, and the shop burns some every open minute', () => {
    const g = openGame();
    expect(g.state.token).toBe(t.start);
    g.tick();
    expect(g.state.token).toBe(t.start - t.openPerMinute);
  });

  it('warns once when it falls below the low mark, then again only after a top-up', () => {
    const g = openGame();
    g.state.token = t.lowMark + t.openPerMinute;
    expect(types(g.tick())).toEqual([]); // still at the mark
    expect(types(g.tick())).toContain('token_low');
    expect(types(g.tick())).not.toContain('token_low');
  });

  it('running out switches the power off in the middle of service', () => {
    const g = openGame();
    g.state.token = t.openPerMinute;
    expect(types(g.tick())).toContain('token_out');
    expect(tokenEmpty(g.state)).toBe(true);
    expect(powerOff(g.state)).toBe(true);
    expect(g.dispatch({ type: 'cookBatch', item: 'es-teh', batches: 1 })).toEqual({ ok: false, error: 'no_ice' });
  });

  it('an empty token costs evening customers, and tracks how long the fridge sat warm', () => {
    const g = openGame();
    g.state.token = 0;
    g.state.minute = content.balance.outage.darkFrom + 5;
    expect(arrivalMul(g.state, g.content)).toBe(content.balance.outage.lantern.darkMul);
    g.tick();
    expect(g.state.tokenOffMinutes).toBe(1);
    expect(g.state.token).toBe(0);
  });

  it('a PLN cut does not burn credit', () => {
    const g = openGame();
    g.state.outage = { day: 0, from: g.state.minute, hours: 2, known: false, ice: false };
    g.tick();
    expect(g.state.token).toBe(t.start);
  });

  it('a top-up pays the pack plus the fee from the bank and brings the power back at once', () => {
    const g = openGame();
    g.state.token = 0;
    const bank = g.state.bank;
    const res = g.dispatch({ type: 'buyToken', amount: 50000 });
    expect(res).toMatchObject({ ok: true, events: [{ type: 'token_bought', amount: 50000, fee: t.fee }] });
    expect(g.state.token).toBe(50000);
    expect(g.state.bank).toBe(bank - 50000 - t.fee);
    expect(powerOff(g.state)).toBe(false);
  });

  it('refuses a pack that is not sold or that the bank cannot cover, leaving state alone', () => {
    const g = openGame();
    const before = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'buyToken', amount: 12345 })).toEqual({ ok: false, error: 'invalid_amount' });
    g.state.bank = 20000;
    const mid = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'buyToken', amount: 20000 })).toEqual({ ok: false, error: 'insufficient_funds' });
    expect(JSON.stringify(g.state)).toBe(mid);
    expect(before).not.toBe('');
  });

  it('each night burns a little credit, and an empty token at bedtime spoils what the fridge kept', () => {
    const g = idle();
    const start = g.state.token;
    passDay(g);
    expect(g.state.token).toBe(start - t.perDay);

    const dry = idle();
    dry.state.token = 0;
    dry.state.pantry = [{ ingredient: 'sawi', qty: 1000, bought: dry.state.day - 2, unitCost: 5, stored: 'fridge' }];
    passDay(dry);
    expect(dry.state.lastSpoiled.map((s) => s.ingredient)).toEqual(['sawi']);
    expect(dry.state.tokenOffMinutes).toBe(0);

    const fine = idle();
    fine.state.pantry = [{ ingredient: 'sawi', qty: 1000, bought: fine.state.day - 2, unitCost: 5, stored: 'fridge' }];
    passDay(fine);
    expect(fine.state.lastSpoiled).toEqual([]);
  });
});

describe('bills', () => {
  const dueIn = (g: Game, days: number) => {
    g.state.bills[rent.id].dueDay = g.state.day + days;
  };

  it('start due after the first-due days', () => {
    expect(idle().state.bills[rent.id].dueDay).toBe(rent.firstDue);
  });

  it('are announced when they come within notice, and on the day', () => {
    const g = idle();
    dueIn(g, rent.noticeDays + 1);
    expect(types(passDay(g))).toContain('bill_notice');
    expect(types(passDay(g))).not.toContain('bill_notice');
    dueIn(g, 1);
    expect(types(passDay(g))).toContain('bill_notice');
  });

  it('cannot be paid long before they are due', () => {
    const g = idle();
    dueIn(g, rent.noticeDays + 1);
    const before = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'payBill', id: rent.id })).toEqual({ ok: false, error: 'not_due_yet' });
    expect(g.dispatch({ type: 'payBill', id: 'nope' })).toEqual({ ok: false, error: 'unknown_bill' });
    expect(JSON.stringify(g.state)).toBe(before);
    expect(payable(g.state, g.content, rent.id)).toBe(false);
  });

  it('are paid from the bank and come due again a period later', () => {
    const g = idle();
    dueIn(g, 1);
    const due = g.state.bills[rent.id].dueDay;
    const bank = g.state.bank;
    expect(g.dispatch({ type: 'payBill', id: rent.id })).toMatchObject({ ok: true, events: [{ type: 'bill_paid', id: rent.id, total: rent.amount }] });
    expect(g.state.bank).toBe(bank - rent.amount);
    expect(g.state.bills[rent.id].dueDay).toBe(due + rent.everyDays);
  });

  it('cost a late fee past the grace days, and reputation every night they stay unpaid', () => {
    const g = idle();
    dueIn(g, -rent.grace);
    expect(isOverdue(g.state, g.content, rent.id)).toBe(false);
    expect(billTotal(g.state, g.content, rent.id)).toBe(rent.amount);
    const rep = g.state.reputation;
    expect(types(passDay(g))).toContain('bill_overdue'); // the night that crosses the grace
    expect(daysLate(g.state, rent.id)).toBe(rent.grace + 1);
    expect(g.state.reputation).toBe(rep + rent.rep);
    expect(billTotal(g.state, g.content, rent.id)).toBe(rent.amount + rent.lateFee);
    const bank = g.state.bank;
    g.dispatch({ type: 'payBill', id: rent.id });
    expect(g.state.bank).toBe(bank - rent.amount - rent.lateFee);
    expect(g.state.bills[rent.id].dueDay).toBeGreaterThan(g.state.day);
  });

  it('refuse payment the bank cannot cover', () => {
    const g = idle();
    dueIn(g, 0);
    g.state.bank = rent.amount - 1;
    const before = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'payBill', id: rent.id })).toEqual({ ok: false, error: 'insufficient_funds' });
    expect(JSON.stringify(g.state)).toBe(before);
  });

  it('replay exactly with top-ups and payments in the log', () => {
    const g = idle();
    for (let i = 0; i < rent.firstDue - rent.noticeDays; i++) passDay(g);
    g.dispatch({ type: 'buyToken', amount: 20000 });
    expect(g.dispatch({ type: 'payBill', id: rent.id }).ok).toBe(true);
    const again = replay(g.content, g.state.seed, g.log);
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(g.state));
  });
});
