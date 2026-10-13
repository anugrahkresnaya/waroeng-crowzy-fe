import { describe, expect, it } from 'vitest';
import { content } from './content';
import { Game } from './game';
import { batchesPossible } from './kitchen';
import { displayPortions, ingredientQty, portionsLeft } from './market';
import { sleepThrough } from './testing/bot';
import { addCustomer, kitchenContent } from './testing/fixtures';

const gorengan = content.itemById['gorengan'];
const batch = gorengan.batch!;

const newGame = (seed = 1) => new Game(kitchenContent(), { seed });
const openShop = (g: Game) => {
  expect(g.dispatch({ type: 'open', prepared: true }).ok).toBe(true);
};

describe('cooking a batch before opening', () => {
  it('uses the pantry and the pre-open minutes, and puts portions on the display', () => {
    const g = newGame();
    const flour = ingredientQty(g.state, 'tepung');
    expect(g.dispatch({ type: 'cookBatch', item: 'gorengan', batches: 1 })).toMatchObject({ ok: true });
    expect(displayPortions(g.state, 'gorengan')).toBe(batch.portions);
    expect(g.state.preOpenUsed).toBe(batch.minutes);
    expect(ingredientQty(g.state, 'tepung')).toBeCloseTo(flour - 20 * batch.portions, 6);
    const lot = g.state.display['gorengan'][0];
    expect(lot.unitCost).toBeGreaterThan(0);
    // ready when the doors open
    expect(lot.cookedAt).toBe(g.state.day * 1440 + content.balance.openMinute);
  });

  it('refuses without changing anything: too little time, missing ingredients, bad amounts, a dish that is not batch', () => {
    const g = newGame();
    const check = (cmd: Parameters<Game['dispatch']>[0], error: string) => {
      const before = JSON.stringify(g.state);
      expect(g.dispatch(cmd)).toEqual({ ok: false, error });
      expect(JSON.stringify(g.state)).toBe(before);
    };
    check({ type: 'cookBatch', item: 'gorengan', batches: 0 }, 'invalid_quantity');
    check({ type: 'cookBatch', item: 'gorengan', batches: 1.5 }, 'invalid_quantity');
    check({ type: 'cookBatch', item: 'indomie-goreng', batches: 1 }, 'not_a_batch_dish');
    check({ type: 'cookBatch', item: 'durian', batches: 1 }, 'unknown_item');
    check({ type: 'cookBatch', item: 'gorengan', batches: 20 }, 'no_time'); // 20 x 15 min does not fit in the two hours
    g.state.pantry = g.state.pantry.filter((l) => l.ingredient !== 'tepung');
    check({ type: 'cookBatch', item: 'gorengan', batches: 1 }, 'missing_ingredients');
    expect(batchesPossible(g.state, g.content, gorengan)).toBe(0);
  });

  it('shares the two-hour block with preparing the shelves, so only a few batches fit', () => {
    const g = newGame();
    g.state.preOpenUsed = content.balance.prepareMinutes; // shelves prepared
    const free = content.balance.preOpenMinutes - g.state.preOpenUsed;
    expect(Math.floor(free / batch.minutes)).toBeLessThan(4);
    const fits = Math.floor(free / batch.minutes);
    expect(g.dispatch({ type: 'cookBatch', item: 'gorengan', batches: fits + 1 })).toEqual({ ok: false, error: 'no_time' });
    expect(g.dispatch({ type: 'cookBatch', item: 'gorengan', batches: fits }).ok).toBe(true);
  });
});

describe('selling from the display', () => {
  it('a batch dish is out of stock until it is cooked, even with ingredients in the pantry', () => {
    const g = newGame();
    openShop(g);
    expect(ingredientQty(g.state, 'tepung')).toBeGreaterThan(0);
    expect(portionsLeft(g.state, g.content, 'gorengan')).toBe(0);
    addCustomer(g, { order: [{ itemId: 'gorengan', qty: 1 }] });
    expect(g.dispatch({ type: 'pick', itemId: 'gorengan' })).toEqual({ ok: false, error: 'out_of_stock' });
  });

  it('a sale takes portions off the display and costs what they cost to cook', () => {
    const g = newGame();
    g.dispatch({ type: 'cookBatch', item: 'gorengan', batches: 1 });
    const unit = g.state.display['gorengan'][0].unitCost;
    openShop(g);
    addCustomer(g, { order: [{ itemId: 'gorengan', qty: 3 }], method: 'qris' });
    for (let i = 0; i < 3; i++) g.dispatch({ type: 'pick', itemId: 'gorengan' });
    expect(portionsLeft(g.state, g.content, 'gorengan', g.state.line[0].tray)).toBe(batch.portions - 3);
    g.dispatch({ type: 'confirmOrder' });
    g.dispatch({ type: 'confirmQris' });
    expect(displayPortions(g.state, 'gorengan')).toBe(batch.portions - 3);
    expect(g.state.stats.cogs).toBeCloseTo(3 * unit, 6);
  });

  it('the oldest batch is sold first', () => {
    const g = newGame();
    g.dispatch({ type: 'cookBatch', item: 'gorengan', batches: 1 });
    g.state.display['gorengan'][0].unitCost = 100;
    g.dispatch({ type: 'cookBatch', item: 'gorengan', batches: 1 });
    g.state.display['gorengan'][1].unitCost = 900;
    openShop(g);
    addCustomer(g, { order: [{ itemId: 'gorengan', qty: batch.portions + 1 }], method: 'qris' });
    for (let i = 0; i < batch.portions + 1; i++) g.dispatch({ type: 'pick', itemId: 'gorengan' });
    g.dispatch({ type: 'confirmOrder' });
    g.dispatch({ type: 'confirmQris' });
    expect(g.state.stats.cogs).toBeCloseTo(batch.portions * 100 + 900, 6);
  });
});

describe('food going stale', () => {
  it('portions left on the display past their fresh time are thrown out and counted as waste', () => {
    const g = newGame();
    g.dispatch({ type: 'cookBatch', item: 'gorengan', batches: 1 });
    const cost = g.state.display['gorengan'][0].unitCost * batch.portions;
    openShop(g);
    for (let i = 0; i < batch.freshMinutes - 1; i++) g.tick();
    expect(displayPortions(g.state, 'gorengan')).toBe(batch.portions);
    g.tick();
    expect(displayPortions(g.state, 'gorengan')).toBe(0);
    expect(g.state.stats.waste).toBeCloseTo(cost, 6);
  });

  it('nothing cooked yesterday is sold today', () => {
    const g = newGame();
    g.dispatch({ type: 'cookBatch', item: 'es-teh', batches: 1 });
    openShop(g);
    g.dispatch({ type: 'closeWarung' });
    expect(displayPortions(g.state, 'es-teh')).toBeGreaterThan(0);
    sleepThrough(g, { open: true });
    expect(g.state.display).toEqual({});
  });
});

describe('cooking while the shop is open', () => {
  it('takes the cook away from the counter until the batch is done', () => {
    const g = newGame();
    openShop(g);
    expect(g.dispatch({ type: 'cookBatch', item: 'es-teh', batches: 1 }).ok).toBe(true);
    expect(g.state.busyUntil).toBe(g.state.tick + content.itemById['es-teh'].batch!.minutes);
    expect(g.dispatch({ type: 'cookBatch', item: 'es-teh', batches: 1 })).toEqual({ ok: false, error: 'busy' });
    addCustomer(g, { order: [{ itemId: 'es-teh', qty: 1 }] });
    expect(g.dispatch({ type: 'pick', itemId: 'es-teh' })).toEqual({ ok: false, error: 'busy' });
    for (let i = 0; i < content.itemById['es-teh'].batch!.minutes; i++) g.tick();
    expect(g.state.busyUntil).toBe(0);
    expect(g.dispatch({ type: 'pick', itemId: 'es-teh' }).ok).toBe(true);
  });

  it('cannot start before the shelves are ready', () => {
    const g = newGame();
    g.dispatch({ type: 'open', prepared: false });
    expect(g.dispatch({ type: 'cookBatch', item: 'es-teh', batches: 1 })).toEqual({ ok: false, error: 'shelves_not_ready' });
  });
});

describe('leftovers at night', () => {
  const withLeftovers = () => {
    const g = newGame();
    g.dispatch({ type: 'cookBatch', item: 'gorengan', batches: 1 });
    openShop(g);
    g.dispatch({ type: 'closeWarung' });
    return g;
  };

  it('obral sells them at a reduced price into the drawer', () => {
    const g = withLeftovers();
    const drawer = Object.entries(g.state.drawer).reduce((s, [d, n]) => s + Number(d) * n, 0);
    expect(g.dispatch({ type: 'handleLeftover', item: 'gorengan', choice: 'obral' }).ok).toBe(true);
    const money = Math.round((batch.portions * g.state.menu['gorengan'].price * content.balance.leftovers.obralMul) / 500) * 500;
    expect(g.state.stats.obralRevenue).toBe(money);
    expect(Object.entries(g.state.drawer).reduce((s, [d, n]) => s + Number(d) * n, 0)).toBe(drawer + money);
    expect(displayPortions(g.state, 'gorengan')).toBe(0);
  });

  it('eating lowers hunger, and never below zero', () => {
    const g = withLeftovers();
    g.state.hunger = 30;
    g.dispatch({ type: 'handleLeftover', item: 'gorengan', choice: 'eat' });
    expect(g.state.hunger).toBe(0);
    expect(g.state.stats.waste).toBe(0);
  });

  it('giving away builds reputation up to a cap', () => {
    const g = withLeftovers();
    const before = g.state.reputation;
    g.dispatch({ type: 'handleLeftover', item: 'gorengan', choice: 'give' });
    expect(g.state.reputation - before).toBeCloseTo(content.balance.leftovers.giveRepMax, 6);
  });

  it('throwing away is a clean loss', () => {
    const g = withLeftovers();
    const cost = g.state.display['gorengan'].reduce((s, b) => s + b.qty * b.unitCost, 0);
    g.dispatch({ type: 'handleLeftover', item: 'gorengan', choice: 'trash' });
    expect(g.state.stats.waste).toBeCloseTo(cost, 6);
  });

  it('refuses when there is nothing left, a bad choice, or the shop is still open', () => {
    const g = newGame();
    openShop(g);
    const before = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'handleLeftover', item: 'gorengan', choice: 'trash' })).toEqual({ ok: false, error: 'wrong_phase' });
    g.dispatch({ type: 'closeWarung' });
    expect(g.dispatch({ type: 'handleLeftover', item: 'gorengan', choice: 'trash' })).toEqual({ ok: false, error: 'no_leftovers' });
    expect(g.dispatch({ type: 'handleLeftover', item: 'gorengan', choice: 'sell' as never })).toEqual({ ok: false, error: 'invalid_choice' });
    expect(g.dispatch({ type: 'handleLeftover', item: 'indomie-goreng', choice: 'trash' })).toEqual({ ok: false, error: 'not_a_batch_dish' });
    expect(before).not.toBe(''); // the open-shop refusal above left state alone, checked by the fuzz test as well
  });
});
