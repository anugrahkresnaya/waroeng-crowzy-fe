import { describe, expect, it } from 'vitest';
import { content } from './content';
import { Game } from './game';
import { replay } from './replay';
import { addCustomer, kitchenContent } from './testing/fixtures';
import { titipanCost, titipanLevel, titipanRoom, titipanUnlocked } from './titipan';

const t = content.balance.titipan;
const kue = content.itemById['kue-basah'];

/** A game on a day when titipan is available, before opening. */
const idle = (day = t.unlockDay) => new Game(kitchenContent(), { seed: 1, day });
const take = (g: Game, qty: number, item = 'kue-basah') => g.dispatch({ type: 'takeTitipan', item, qty });
const types = (events: Array<{ type: string }>) => events.map((e) => e.type);

/** Sells `n` of the consigned item to the customer at the counter, paying cash. */
function sell(g: Game, n: number, item = 'kue-basah') {
  for (let i = 0; i < n; i++) {
    addCustomer(g, { order: [{ itemId: item, qty: 1 }], method: 'qris', patience: 100 });
    g.dispatch({ type: 'pick', itemId: item });
    g.dispatch({ type: 'confirmOrder' });
    g.dispatch({ type: 'confirmQris' });
  }
}

describe('titipan is offered after a while', () => {
  it('is locked before its day and refuses taking anything', () => {
    const g = idle(t.unlockDay - 1);
    expect(titipanUnlocked(g.state, g.content)).toBe(false);
    const before = JSON.stringify(g.state);
    expect(take(g, 3)).toEqual({ ok: false, error: 'not_unlocked' });
    expect(JSON.stringify(g.state)).toBe(before);
  });

  it('is never on the market, and the consigned goods are not in the shop to begin with', () => {
    const g = idle();
    expect(g.content.productByKey['g-kue-basah']).toBeUndefined();
    expect(g.state.stock['kue-basah'] ?? 0).toBe(0);
  });
});

describe('taking goods from the neighbour', () => {
  it('puts them on the shelf for pre-open minutes, at today\'s cost', () => {
    const g = idle();
    const used = g.state.preOpenUsed;
    const res = take(g, 6);
    expect(types((res as { events: Array<{ type: string }> }).events)).toEqual(['titipan_taken']);
    expect(g.state.stock['kue-basah']).toBe(6);
    expect(g.state.titipan.taken['kue-basah']).toBe(6);
    expect(g.state.preOpenUsed).toBe(used + t.minutes);
    expect(g.state.goodsCost['kue-basah']).toBe(kue.buyPrice);
    expect(titipanRoom(g.state, g.content, 'kue-basah')).toBe(t.levels[0].max - 6);
  });

  it.each([
    ['more than the trust level allows', (g: Game) => take(g, t.levels[0].max + 1), 'titipan_full'],
    ['a bad quantity', (g: Game) => take(g, 0), 'invalid_quantity'],
    ['an item that is not consigned', (g: Game) => take(g, 1, 'rokok'), 'not_consigned'],
    ['an unknown item', (g: Game) => take(g, 1, 'nope'), 'unknown_item'],
  ] as const)('refuses %s without changing anything', (_n, run, error) => {
    const g = idle();
    const before = JSON.stringify(g.state);
    expect(run(g)).toEqual({ ok: false, error });
    expect(JSON.stringify(g.state)).toBe(before);
  });

  it('only before opening, and only with pre-open time left', () => {
    const g = idle();
    g.state.preOpenUsed = content.balance.preOpenMinutes - t.minutes + 1;
    expect(take(g, 1)).toEqual({ ok: false, error: 'no_time' });
    const open = idle();
    open.dispatch({ type: 'open', prepared: true });
    expect(take(open, 1)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('customers only ask for it while there is some on the shelf', () => {
    const asked = (stocked: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const c = kitchenContent(content, { arrivalPerMinute: { morning: 1, lunch: 1, afternoon: 1, evening: 1, night: 1 } });
        const g = new Game(c, { seed, day: t.unlockDay });
        if (stocked) take(g, 10);
        g.dispatch({ type: 'open', prepared: true });
        for (let i = 0; i < 60; i++) g.tick();
        for (const cu of g.state.line) for (const l of cu.order) if (g.content.itemById[l.itemId].consign) n++;
      }
      return n;
    };
    expect(asked(false)).toBe(0);
    expect(asked(true)).toBeGreaterThan(0);
  });
});

describe('closing the day', () => {
  it('returns what is left, pays the neighbour for what sold, and the profit is the margin', () => {
    const g = idle();
    take(g, 10);
    g.dispatch({ type: 'open', prepared: true });
    sell(g, 4);
    const bank = g.state.bank;
    const revenue = g.state.stats.qrisRevenue;
    const events = (g.dispatch({ type: 'closeWarung' }) as { events: Array<{ type: string }> }).events;
    const settled = events.find((e) => e.type === 'titipan_settled');
    expect(settled).toMatchObject({ sold: 4, returned: 6, paid: 4 * kue.buyPrice!, owed: 0 });
    expect(g.state.stock['kue-basah']).toBe(0);
    expect(g.state.titipan.taken).toEqual({});
    expect(g.state.bank).toBe(bank - 4 * kue.buyPrice!);
    expect(g.summary().cogs).toBe(4 * kue.buyPrice!);
    expect(revenue).toBeGreaterThan(0);
  });

  it('with nothing sold nothing is owed and nothing is lost', () => {
    const g = idle();
    take(g, 5);
    g.dispatch({ type: 'open', prepared: true });
    const bank = g.state.bank;
    g.dispatch({ type: 'closeWarung' });
    expect(g.state.bank).toBe(bank);
    expect(g.state.titipan.owed).toBe(0);
    expect(g.state.stock['kue-basah']).toBe(0);
  });

  it('what the bank cannot cover stays owed, blocks taking more, and can be paid later', () => {
    const g = idle();
    take(g, 10);
    g.dispatch({ type: 'open', prepared: true });
    sell(g, 5);
    g.state.bank = 1000;
    g.dispatch({ type: 'closeWarung' });
    const owed = 5 * kue.buyPrice! - 1000;
    expect(g.state.titipan.owed).toBe(owed);
    expect(g.state.bank).toBe(0);

    g.dispatch({ type: 'goToNight' });
    g.dispatch({ type: 'spendFreeTime', activities: [] });
    g.dispatch({ type: 'nextDay' });
    expect(take(g, 1)).toEqual({ ok: false, error: 'owes_neighbor' });
    expect(g.dispatch({ type: 'payNeighbor' })).toEqual({ ok: false, error: 'insufficient_funds' });
    g.state.bank = owed + 5;
    expect(g.dispatch({ type: 'payNeighbor' }).ok).toBe(true);
    expect(g.state.titipan.owed).toBe(0);
    expect(g.state.bank).toBe(5);
    expect(g.dispatch({ type: 'payNeighbor' })).toEqual({ ok: false, error: 'nothing_owed' });
  });
});

describe('the neighbour\'s trust', () => {
  const day = (g: Game, qty: number, sold: number) => {
    take(g, qty);
    g.dispatch({ type: 'open', prepared: true });
    sell(g, sold);
    g.dispatch({ type: 'closeWarung' });
  };

  it('grows when most of what you take sells, falls when almost none does, and is left alone otherwise', () => {
    const g = idle();
    day(g, 10, 6);
    expect(g.state.titipan.relation).toBe(1);
    const g2 = idle();
    day(g2, 10, 3); // between the two shares
    expect(g2.state.titipan.relation).toBe(0);
    const g3 = idle();
    g3.state.titipan.relation = 5;
    day(g3, 10, 0);
    expect(g3.state.titipan.relation).toBe(4);
    const g4 = idle();
    day(g4, 3, 0); // too small a pickup to hurt feelings
    expect(g4.state.titipan.relation).toBe(0);
  });

  it('higher trust lets you take more and costs a little less', () => {
    const g = idle();
    const [l1, , l3] = t.levels;
    expect(titipanLevel(g.state, g.content)).toMatchObject({ level: 1, max: l1.max, next: t.levels[1].relation });
    g.state.titipan.relation = l3.relation;
    expect(titipanLevel(g.state, g.content)).toMatchObject({ level: 3, max: l3.max, next: null });
    expect(titipanCost(g.state, g.content, 'kue-basah')).toBe(Math.round(kue.buyPrice! * l3.costMul));
    expect(take(g, l3.max).ok).toBe(true);
    expect(g.state.goodsCost['kue-basah']).toBe(titipanCost(g.state, g.content, 'kue-basah'));
  });
});

describe('replay', () => {
  it('rebuilds a run with pickups, sales, settlement and a payment', () => {
    const c = kitchenContent();
    const g = new Game(c, { seed: 3, day: t.unlockDay });
    take(g, 8);
    take(g, 4, 'nasi-titipan');
    g.dispatch({ type: 'open', prepared: true });
    for (let i = 0; i < 30; i++) g.tick();
    g.dispatch({ type: 'closeWarung' });
    const again = replay(c, 3, g.log, t.unlockDay);
    expect(again.state.titipan).toEqual(g.state.titipan);
    expect(again.state.bank).toBe(g.state.bank);
  });
});
