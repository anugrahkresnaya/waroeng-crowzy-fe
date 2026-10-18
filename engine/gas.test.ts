import { describe, expect, it } from 'vitest';
import { content } from './content';
import { Game } from './game';
import { gasFlames, gasPrice, gasTanks } from './gas';
import { ingredientQty, marketPrice, roundPrice } from './market';
import { replay } from './replay';
import { addCustomer, kitchenContent } from './testing/fixtures';

function openShop() {
  const g = new Game(kitchenContent(), { seed: 1 });
  g.dispatch({ type: 'open', prepared: true });
  return g;
}
/** Before opening, with pre-open time to spend. */
const idleShop = () => new Game(kitchenContent(), { seed: 1 });
const drain = (g: Game, keep = 0) => {
  g.state.pantry = g.state.pantry.filter((l) => l.ingredient !== 'lpg');
  if (keep > 0) g.state.pantry.push({ ingredient: 'lpg', qty: keep, bought: g.state.day, unitCost: 22, stored: 'room' });
};

describe('gas', () => {
  it('a stove with no gas refuses to cook and says why, without changing anything', () => {
    const g = openShop();
    const c = addCustomer(g, { order: [{ itemId: 'indomie-goreng', qty: 1 }], method: 'qris', patience: 200 });
    drain(g);
    const before = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'startCook', item: 'indomie-goreng', auto: false })).toEqual({ ok: false, error: 'out_of_gas' });
    expect(JSON.stringify(g.state)).toBe(before);
    expect(c.stage).toBe('ordering');
  });

  it('less gas than one portion needs counts as out of gas; enough for one still cooks', () => {
    const g = openShop();
    addCustomer(g, { order: [{ itemId: 'indomie-goreng', qty: 2 }], method: 'qris', patience: 200 });
    const need = content.itemById['indomie-goreng'].recipe!.lpg;
    drain(g, need);
    expect(g.dispatch({ type: 'startCook', item: 'indomie-goreng', auto: false }).ok).toBe(true);
    expect(g.dispatch({ type: 'startCook', item: 'indomie-goreng', auto: false })).toEqual({ ok: false, error: 'out_of_gas' });
  });

  it('batch cooking is refused for lack of gas, not reported as missing ingredients', () => {
    const g = idleShop();
    drain(g);
    expect(g.dispatch({ type: 'cookBatch', item: 'gorengan', batches: 1 })).toEqual({ ok: false, error: 'out_of_gas' });
  });

  it('buying a tank next door costs more than the market, arrives at once, and takes pre-open time', () => {
    const g = idleShop();
    drain(g);
    const bank = g.state.bank;
    const price = gasPrice(g.state, g.content);
    expect(price).toBe(roundPrice(marketPrice(g.state, 'lpg') * content.balance.gas.nearbyMarkup));
    expect(price).toBeGreaterThan(marketPrice(g.state, 'lpg'));
    const used = g.state.preOpenUsed;
    const result = g.dispatch({ type: 'buyGas' });
    expect(result).toMatchObject({ ok: true, events: [{ type: 'gas_bought', price }] });
    expect(g.state.bank).toBe(bank - price);
    expect(gasTanks(g.state, g.content)).toBeCloseTo(1, 6);
    expect(g.state.preOpenUsed).toBe(used + content.balance.gas.nearbyMinutes);
    expect(g.dispatch({ type: 'cookBatch', item: 'gorengan', batches: 1 }).ok).toBe(true);
  });

  it('while open it takes the player away from the counter for a while', () => {
    const g = openShop();
    drain(g);
    g.dispatch({ type: 'buyGas' });
    expect(g.state.busyUntil).toBe(g.state.tick + content.balance.gas.nearbyMinutes);
    expect(g.dispatch({ type: 'buyGas' })).toEqual({ ok: false, error: 'busy' });
    for (let i = 0; i < content.balance.gas.nearbyMinutes; i++) g.tick();
    expect(g.state.busyUntil).toBe(0);
    expect(gasFlames(g.state)).toBeGreaterThan(0);
  });

  it('refuses without money, outside cooking hours, or with no pre-open time left, and leaves state alone', () => {
    const g = idleShop();
    const check = (error: string) => {
      const before = JSON.stringify(g.state);
      expect(g.dispatch({ type: 'buyGas' })).toEqual({ ok: false, error });
      expect(JSON.stringify(g.state)).toBe(before);
    };
    g.state.preOpenUsed = content.balance.preOpenMinutes - 5;
    check('no_time');
    g.state.preOpenUsed = 0;
    g.state.bank = 0;
    check('insufficient_funds');
    g.state.phase = 'night';
    check('wrong_phase');
  });

  it('replays exactly with a gas purchase in the log', () => {
    const g = idleShop();
    g.dispatch({ type: 'buyGas' });
    g.dispatch({ type: 'cookBatch', item: 'gorengan', batches: 1 });
    const again = replay(g.content, g.state.seed, g.log);
    expect(ingredientQty(again.state, 'lpg')).toBeCloseTo(ingredientQty(g.state, 'lpg'), 6);
    expect(again.state.preOpenUsed).toBe(g.state.preOpenUsed);
    expect(again.state.bank).toBe(g.state.bank);
  });
});
