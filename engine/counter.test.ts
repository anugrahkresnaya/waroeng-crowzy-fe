import { describe, expect, it } from 'vitest';
import { moodOf } from './counter';
import { Game } from './game';
import { total } from './money';
import { addCustomer, openGame, pickAll, quietContent } from './testing/fixtures';

const indomie = (qty = 1) => [{ itemId: 'indomie-goreng', qty }];

describe('counter: cash', () => {
  it('serves a customer with exact change', () => {
    const game = openGame();
    const drawerBefore = total(game.state.drawer);
    addCustomer(game, { order: indomie(), tender: { 5000: 1 } });
    pickAll(game);
    expect(game.state.line[0].stage).toBe('change');
    const res = game.dispatch({ type: 'giveChange', pieces: { 500: 1 } });
    expect(res.ok).toBe(true);
    expect(game.state.line).toHaveLength(0);
    expect(game.state.stats.served).toBe(1);
    expect(game.state.stats.cashRevenue).toBe(4500);
    expect(total(game.state.drawer)).toBe(drawerBefore + 4500);
    expect(game.state.stock['indomie-goreng']).toBe(39);
    expect(game.state.stats.overChange + game.state.stats.shortChangeUnnoticed).toBe(0);
  });

  it('completes at once when the customer pays the exact amount', () => {
    const game = openGame();
    addCustomer(game, { order: indomie(), tender: { 2000: 2, 500: 1 } });
    pickAll(game);
    expect(game.state.line).toHaveLength(0);
    expect(game.state.stats.served).toBe(1);
  });

  it('tracks change given above what was due', () => {
    const game = openGame();
    addCustomer(game, { order: indomie(), tender: { 5000: 1 } });
    pickAll(game);
    game.dispatch({ type: 'giveChange', pieces: { 1000: 1 } });
    expect(game.state.stats.overChange).toBe(500);
  });

  it('can catch short change, charging the rest and reputation', () => {
    const game = openGame(quietContent(undefined, { noticeShortChange: 1 }));
    const rep = game.state.reputation;
    addCustomer(game, { order: indomie(), tender: { 5000: 1 } });
    pickAll(game);
    const res = game.dispatch({ type: 'giveChange', pieces: {} });
    expect(res.ok && res.events.some((e) => e.type === 'short_change_caught')).toBe(true);
    expect(game.state.stats.shortChangeCaught).toBe(1);
    expect(game.state.reputation).toBeLessThan(rep);
    expect(game.state.stats.moods.annoyed).toBe(1);
  });

  it('lets short change slip by when it is not noticed', () => {
    const game = openGame(quietContent(undefined, { noticeShortChange: 0 }));
    addCustomer(game, { order: indomie(), tender: { 5000: 1 } });
    pickAll(game);
    game.dispatch({ type: 'giveChange', pieces: {} });
    expect(game.state.stats.shortChangeUnnoticed).toBe(1);
    expect(game.state.stats.shortChangeGained).toBe(500);
  });

  it('rejects change the drawer does not hold, without side effects', () => {
    const game = openGame();
    addCustomer(game, { order: indomie(), tender: { 5000: 1 } });
    pickAll(game);
    const before = JSON.stringify(game.state);
    const res = game.dispatch({ type: 'giveChange', pieces: { 100000: 1 } });
    expect(res).toEqual({ ok: false, error: 'not_in_drawer' });
    expect(JSON.stringify(game.state)).toBe(before);
  });

  it('a big-note payer drains small change from the drawer', () => {
    const game = openGame();
    addCustomer(game, { type: 'uang-besar', order: indomie(), tender: { 100000: 1 } });
    pickAll(game);
    const change = 100000 - 4500;
    expect(game.dispatch({ type: 'giveChange', pieces: { 50000: 1, 20000: 2, 5000: 1, 500: 1 } }).ok).toBe(true);
    expect(total({ 50000: 1, 20000: 2, 5000: 1, 500: 1 })).toBe(change);
  });
});

describe('counter: qris and kasbon', () => {
  it('QRIS goes to the bank minus the fee, not the drawer', () => {
    const game = openGame();
    const drawerBefore = total(game.state.drawer);
    addCustomer(game, { order: indomie(), method: 'qris' });
    pickAll(game);
    expect(game.state.line[0].stage).toBe('paying');
    game.dispatch({ type: 'confirmQris' });
    expect(game.state.stats.qrisFees).toBe(Math.ceil((4500 * 70) / 10000));
    expect(game.state.bank).toBe(4500 - game.state.stats.qrisFees);
    expect(total(game.state.drawer)).toBe(drawerBefore);
  });

  it('kasbon writes the bill in the book', () => {
    const game = openGame();
    addCustomer(game, { order: indomie(2), method: 'kasbon' });
    pickAll(game);
    game.dispatch({ type: 'grantKasbon' });
    expect(game.state.kasbon).toEqual([{ customerId: 1, type: 'langganan', amount: 9000, day: 0 }]);
    expect(game.state.stats.kasbonCredit).toBe(9000);
    expect(game.state.stats.served).toBe(1);
  });

  it('refusing kasbon loses the sale and a little reputation', () => {
    const game = openGame();
    const rep = game.state.reputation;
    addCustomer(game, { order: indomie(), method: 'kasbon' });
    pickAll(game);
    game.dispatch({ type: 'refuseKasbon' });
    expect(game.state.stats.served).toBe(0);
    expect(game.state.stats.kasbonRefused).toBe(1);
    expect(game.state.reputation).toBeLessThan(rep);
    expect(game.state.stock['indomie-goreng']).toBe(40);
  });

  it('rejects the wrong payment command for the method', () => {
    const game = openGame();
    addCustomer(game, { order: indomie(), method: 'qris' });
    pickAll(game);
    expect(game.dispatch({ type: 'grantKasbon' })).toEqual({ ok: false, error: 'wrong_method' });
  });
});

describe('counter: picking and orders', () => {
  it('a wrong tray costs patience and a mistake count, then can be fixed', () => {
    const game = openGame();
    const c = addCustomer(game, { order: indomie(2), method: 'qris' });
    game.dispatch({ type: 'pick', itemId: 'indomie-goreng' });
    game.dispatch({ type: 'confirmOrder' });
    expect(game.state.stats.wrongTrays).toBe(1);
    expect(c.patience).toBe(30 - 4);
    expect(c.stage).toBe('ordering');
    game.dispatch({ type: 'pick', itemId: 'indomie-goreng' });
    game.dispatch({ type: 'confirmOrder' });
    expect(c.stage).toBe('paying');
  });

  it('unpick removes an item from the tray', () => {
    const game = openGame();
    const c = addCustomer(game, { order: indomie() });
    game.dispatch({ type: 'pick', itemId: 'es-teh' });
    expect(c.tray).toEqual({ 'es-teh': 1 });
    game.dispatch({ type: 'unpick', itemId: 'es-teh' });
    expect(c.tray).toEqual({});
    expect(game.dispatch({ type: 'unpick', itemId: 'es-teh' })).toEqual({ ok: false, error: 'not_in_tray' });
  });

  it('refuses to pick an item that is out of stock, and declining finishes the order without it', () => {
    const game = openGame();
    game.state.stock['es-teh'] = 0;
    const c = addCustomer(game, {
      order: [{ itemId: 'es-teh', qty: 1 }, ...indomie()],
      method: 'qris',
    });
    expect(game.dispatch({ type: 'pick', itemId: 'es-teh' })).toEqual({ ok: false, error: 'out_of_stock' });
    game.dispatch({ type: 'declineItem', itemId: 'es-teh' });
    expect(game.state.stats.stockoutDeclines).toBe(1);
    expect(c.patience).toBe(30 - 3);
    expect(c.bill).toBe(4500);
    pickAll(game);
    game.dispatch({ type: 'confirmQris' });
    expect(game.state.stats.served).toBe(1);
  });

  it('declining the whole order sends the customer away', () => {
    const game = openGame();
    game.state.stock['es-teh'] = 0;
    addCustomer(game, { order: [{ itemId: 'es-teh', qty: 1 }] });
    const res = game.dispatch({ type: 'declineItem', itemId: 'es-teh' });
    expect(res.ok).toBe(true);
    expect(game.state.line).toHaveLength(0);
    expect(game.state.stats.served).toBe(0);
  });

  it('cannot pick more than is in stock, counting what is already in the tray', () => {
    const game = openGame();
    game.state.stock['rokok'] = 1;
    addCustomer(game, { order: [{ itemId: 'rokok', qty: 2 }] });
    expect(game.dispatch({ type: 'pick', itemId: 'rokok' }).ok).toBe(true);
    expect(game.dispatch({ type: 'pick', itemId: 'rokok' })).toEqual({ ok: false, error: 'out_of_stock' });
  });
});

describe('counter: age check', () => {
  const smoke = [{ itemId: 'rokok', qty: 1 }];

  it('selling cigarettes to a minor costs reputation', () => {
    const game = openGame();
    const rep = game.state.reputation;
    addCustomer(game, { type: 'pelajar', order: smoke, method: 'qris', age: 16 });
    pickAll(game);
    const res = game.dispatch({ type: 'confirmQris' });
    expect(res.ok && res.events.some((e) => e.type === 'underage_sale')).toBe(true);
    expect(game.state.stats.underageSales).toBe(1);
    expect(game.state.reputation).toBeLessThan(rep - 3);
  });

  it('checking the KTP costs patience once, and declining avoids the penalty', () => {
    const game = openGame();
    const c = addCustomer(game, { type: 'pelajar', order: [...smoke, ...indomie()], method: 'qris', age: 16 });
    game.dispatch({ type: 'checkKtp' });
    expect(c.ktpChecked).toBe(true);
    expect(c.patience).toBe(28);
    expect(game.dispatch({ type: 'checkKtp' })).toEqual({ ok: false, error: 'already_checked' });
    game.dispatch({ type: 'declineItem', itemId: 'rokok' });
    pickAll(game);
    game.dispatch({ type: 'confirmQris' });
    expect(game.state.stats.underageSales).toBe(0);
  });

  it('an adult buys cigarettes without a penalty', () => {
    const game = openGame();
    addCustomer(game, { order: smoke, method: 'qris', age: 30 });
    pickAll(game);
    game.dispatch({ type: 'confirmQris' });
    expect(game.state.stats.underageSales).toBe(0);
  });
});

describe('counter: time', () => {
  it('customers lose patience while waiting, the whole line included, and walk away at zero', () => {
    const game = openGame();
    addCustomer(game, { order: indomie(), patience: 3 });
    const second = addCustomer(game, { order: indomie(), patience: 10 });
    const events = [...game.tick(), ...game.tick(), ...game.tick()];
    expect(game.state.line).toEqual([second]);
    expect(second.patience).toBe(7);
    expect(events).toContainEqual({ type: 'walkaway', customerId: 1, reason: 'patience' });
    expect(game.state.stats.walkaways).toBe(1);
  });

  it('shows mood from remaining patience', () => {
    expect(moodOf({ patience: 30, maxPatience: 30 })).toBe('happy');
    expect(moodOf({ patience: 12, maxPatience: 30 })).toBe('neutral');
    expect(moodOf({ patience: 4, maxPatience: 30 })).toBe('annoyed');
  });

  it('skipping prep blocks the counter until the shelves are restocked', () => {
    const game = openGame(quietContent(), 1, false);
    addCustomer(game, { order: indomie(), patience: 60 });
    expect(game.dispatch({ type: 'pick', itemId: 'indomie-goreng' })).toEqual({ ok: false, error: 'shelves_not_ready' });
    expect(game.dispatch({ type: 'restockShelves' }).ok).toBe(true);
    expect(game.dispatch({ type: 'pick', itemId: 'indomie-goreng' })).toEqual({ ok: false, error: 'busy' });
    for (let i = 0; i < 10; i++) game.tick();
    expect(game.state.shelfReady).toBe(true);
    expect(game.state.line[0].patience).toBe(50);
    expect(game.dispatch({ type: 'pick', itemId: 'indomie-goreng' }).ok).toBe(true);
  });

  it('turns customers away when the line is full', () => {
    const game = openGame(quietContent(undefined, { lineCapacity: 2 }));
    game.state.minute = 12 * 60;
    const busy = { ...game.content, balance: { ...game.content.balance, arrivalPerMinute: { morning: 1, lunch: 1, afternoon: 1, evening: 1, night: 1 } } };
    const g = openGame(busy);
    g.state.minute = 12 * 60;
    for (let i = 0; i < 6; i++) g.tick();
    expect(g.state.line.length).toBeLessThanOrEqual(busy.balance.lineCapacity);
    expect(g.state.stats.turnedAway).toBeGreaterThan(0);
  });

  it('closing the day sends everyone home without a reputation hit', () => {
    const game = openGame();
    addCustomer(game, { order: indomie() });
    const rep = game.state.reputation;
    game.state.minute = game.content.balance.closeMinute - 1;
    const events = game.tick();
    expect(game.state.phase).toBe('ended');
    expect(game.state.line).toHaveLength(0);
    expect(game.state.stats.leftAtClose).toBe(1);
    expect(game.state.reputation).toBe(rep);
    expect(events.map((e) => e.type)).toContain('closed');
    expect(game.tick()).toEqual([]);
  });

  it('closing early works like closing time', () => {
    const game = openGame();
    addCustomer(game, { order: indomie() });
    game.dispatch({ type: 'closeWarung' });
    expect(game.state.phase).toBe('ended');
    expect(game.state.stats.leftAtClose).toBe(1);
  });

  it('ignores commands outside an open day', () => {
    const idle = openGame();
    idle.dispatch({ type: 'closeWarung' });
    expect(idle.dispatch({ type: 'pick', itemId: 'es-teh' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(idle.dispatch({ type: 'open', prepared: true })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('reports no_customer when the line is empty', () => {
    expect(openGame().dispatch({ type: 'pick', itemId: 'es-teh' })).toEqual({ ok: false, error: 'no_customer' });
  });
});

describe('pre-open: exchanging cash and the time budget', () => {
  const idle = () => new Game(quietContent(), { seed: 1 });

  it('exchanges big notes for small ones, minus the fee, and uses 30 minutes', () => {
    const g = idle();
    const before = total(g.state.drawer);
    const res = g.dispatch({ type: 'exchangeCash', amount: 50000 });
    expect(res.ok && res.events).toEqual([{ type: 'exchanged', amount: 50000, fee: 1000 }]);
    expect(total(g.state.drawer)).toBe(before - 1000);
    expect(g.state.stats.exchangeFees).toBe(1000);
    expect(g.state.preOpenUsed).toBe(30);
    expect(g.state.drawer[50000]).toBe(1);
    expect(g.state.drawer[10000]).toBeGreaterThan(5);
  });

  it('rejects bad amounts, notes the drawer does not hold, and unknown phases', () => {
    const g = idle();
    expect(g.dispatch({ type: 'exchangeCash', amount: 20000 })).toEqual({ ok: false, error: 'invalid_amount' });
    g.state.drawer[100000] = 0;
    g.state.drawer[50000] = 0;
    expect(g.dispatch({ type: 'exchangeCash', amount: 50000 })).toEqual({ ok: false, error: 'not_in_drawer' });
    g.dispatch({ type: 'open', prepared: false });
    expect(g.dispatch({ type: 'exchangeCash', amount: 50000 })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('exchange plus preparing exactly fills the 120 minute block, and more is refused', () => {
    const g = idle();
    expect(g.dispatch({ type: 'exchangeCash', amount: 50000 }).ok).toBe(true);
    expect(g.dispatch({ type: 'open', prepared: true }).ok).toBe(true);
    expect(g.state.preOpenUsed).toBe(120);

    const h = idle();
    h.dispatch({ type: 'exchangeCash', amount: 50000 });
    h.dispatch({ type: 'exchangeCash', amount: 50000 });
    expect(h.dispatch({ type: 'open', prepared: true })).toEqual({ ok: false, error: 'no_time' });
    expect(h.dispatch({ type: 'open', prepared: false }).ok).toBe(true);
  });
});

describe('days', () => {
  it('nextDay starts a fresh idle day and keeps money, reputation and kasbon', () => {
    const g = openGame();
    addCustomer(g, { order: indomie(), method: 'kasbon' });
    pickAll(g);
    g.dispatch({ type: 'grantKasbon' });
    const rep = g.state.reputation;
    g.dispatch({ type: 'closeWarung' });
    expect(g.dispatch({ type: 'open', prepared: true })).toEqual({ ok: false, error: 'wrong_phase' });
    g.state.stock['indomie-goreng'] = 3;
    const res = g.dispatch({ type: 'nextDay' });
    expect(res.ok && res.events).toEqual([{ type: 'new_day', day: 1 }]);
    expect(g.state.phase).toBe('idle');
    expect(g.state.day).toBe(1);
    expect(g.state.minute).toBe(g.content.balance.openMinute);
    expect(g.state.stats.served).toBe(0);
    expect(g.state.preOpenUsed).toBe(0);
    expect(g.state.kasbon).toHaveLength(1);
    expect(g.state.reputation).toBe(rep);
    expect(g.state.stock['indomie-goreng']).toBe(40);
    expect(g.dispatch({ type: 'nextDay' })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('records gross sales per open hour', () => {
    const g = openGame();
    g.state.minute = g.content.balance.openMinute + 125;
    addCustomer(g, { order: indomie(), method: 'qris' });
    pickAll(g);
    g.dispatch({ type: 'confirmQris' });
    expect(g.state.stats.salesByHour[2]).toBe(4500);
    expect(g.state.stats.salesByHour).toHaveLength(15);
    expect(g.summary().salesByHour.reduce((a, b) => a + b, 0)).toBe(g.summary().grossSales);
  });
});
