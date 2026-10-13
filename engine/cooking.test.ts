import { describe, expect, it } from 'vitest';
import { content } from './content';
import { justRight, practiceBonus } from './cooking';
import { Game } from './game';
import { ingredientQty } from './market';
import { addCustomer, kitchenContent } from './testing/fixtures';

const indomie = content.itemById['indomie-goreng'];
const ideal = indomie.cook!.minutes;
const window = indomie.cook!.window;

/** An open shop with the shelves ready and an indomie customer at the counter. */
function setup(qty = 1) {
  const g = new Game(kitchenContent(), { seed: 1 });
  g.dispatch({ type: 'open', prepared: true });
  const c = addCustomer(g, { order: [{ itemId: 'indomie-goreng', qty }], method: 'qris', patience: 200 });
  return { g, c };
}
const wait = (g: Game, minutes: number) => {
  for (let i = 0; i < minutes; i++) g.tick();
};
const send = (g: Game, cmd: Parameters<Game['dispatch']>[0]) => g.dispatch(cmd);

describe('cooking to order', () => {
  it('a cooked dish cannot be picked straight from the shelf, and a plated one cannot be taken back', () => {
    const { g } = setup();
    expect(send(g, { type: 'pick', itemId: 'indomie-goreng' })).toEqual({ ok: false, error: 'needs_cooking' });
    send(g, { type: 'startCook', item: 'indomie-goreng', auto: false });
    wait(g, ideal);
    send(g, { type: 'plate', burner: 0 });
    expect(send(g, { type: 'unpick', itemId: 'indomie-goreng' })).toEqual({ ok: false, error: 'already_cooked' });
  });

  it('putting a dish on uses its ingredients and a burner, and refuses without changing anything', () => {
    const { g } = setup(3);
    const noodles = ingredientQty(g.state, 'mi-instan');
    expect(send(g, { type: 'startCook', item: 'indomie-goreng', auto: false }).ok).toBe(true);
    expect(ingredientQty(g.state, 'mi-instan')).toBeCloseTo(noodles - 1, 6);
    expect(g.state.burners[0]).toMatchObject({ item: 'indomie-goreng', auto: false });
    expect(send(g, { type: 'startCook', item: 'indomie-goreng', auto: false }).ok).toBe(true);

    const check = (cmd: Parameters<Game['dispatch']>[0], error: string) => {
      const before = JSON.stringify(g.state);
      expect(g.dispatch(cmd)).toEqual({ ok: false, error });
      expect(JSON.stringify(g.state)).toBe(before);
    };
    check({ type: 'startCook', item: 'indomie-goreng', auto: false }, 'no_burner'); // both burners are in use
    check({ type: 'startCook', item: 'es-teh', auto: false }, 'not_cooked_to_order');
    check({ type: 'startCook', item: 'kopi-hitam', auto: false }, 'not_in_order');
    check({ type: 'plate', burner: 5 }, 'no_such_burner');
    wait(g, 3);
    send(g, { type: 'plate', burner: 1 });
    check({ type: 'plate', burner: 1 }, 'nothing_to_cook');
  });

  it('cannot cook more portions than were ordered', () => {
    const { g } = setup(1);
    send(g, { type: 'startCook', item: 'indomie-goreng', auto: false });
    expect(send(g, { type: 'startCook', item: 'indomie-goreng', auto: false })).toEqual({ ok: false, error: 'already_cooked' });
  });

  it('is out of stock when the noodles are gone', () => {
    const { g } = setup();
    g.state.pantry = g.state.pantry.filter((l) => l.ingredient !== 'mi-instan');
    expect(send(g, { type: 'startCook', item: 'indomie-goreng', auto: false })).toEqual({ ok: false, error: 'out_of_stock' });
  });
});

describe('how it comes out', () => {
  const plateAt = (minutes: number) => {
    const { g, c } = setup();
    send(g, { type: 'startCook', item: 'indomie-goreng', auto: false });
    wait(g, minutes);
    send(g, { type: 'plate', burner: 0 });
    return { g, c };
  };

  it('plating in the just-right window is pas, too early is kurang, too late is gosong', () => {
    expect(plateAt(ideal).c.cooked['indomie-goreng'][0].quality).toBe('pas');
    expect(plateAt(ideal - window).c.cooked['indomie-goreng'][0].quality).toBe('pas');
    expect(plateAt(ideal + window).c.cooked['indomie-goreng'][0].quality).toBe('pas');
    expect(plateAt(ideal - window - 1).c.cooked['indomie-goreng'][0].quality).toBe('kurang');
    expect(plateAt(ideal + window + 1).c.cooked['indomie-goreng'][0].quality).toBe('gosong');
  });

  it('the dish goes on the tray and the day counts it', () => {
    const { g, c } = plateAt(ideal);
    expect(c.tray).toEqual({ 'indomie-goreng': 1 });
    expect(g.state.stats.cooking.pas).toBe(1);
    expect(g.state.burners.every((b) => b === null)).toBe(true);
  });

  const sell = (minutes: number) => {
    const { g } = plateAt(minutes);
    const rep = g.state.reputation;
    send(g, { type: 'confirmOrder' });
    send(g, { type: 'confirmQris' });
    return { g, rep };
  };

  it('a perfect dish earns reputation, a spoiled one loses it and annoys the customer', () => {
    const good = sell(ideal);
    expect(good.g.state.reputation - good.rep).toBeCloseTo(content.balance.cooking.rep.pas + content.balance.reputation.happy, 6);
    const burnt = sell(ideal + window + 3);
    expect(burnt.g.state.reputation - burnt.rep).toBeCloseTo(content.balance.cooking.rep.gosong + content.balance.reputation.annoyed, 6);
    expect(burnt.g.state.stats.moods.annoyed).toBe(1);
    expect(good.g.state.stats.moods.annoyed).toBe(0);
  });

  it('the sale costs what the ingredients cost, counted once', () => {
    const { g } = sell(ideal);
    expect(g.state.stats.cogs).toBeGreaterThan(0);
    expect(g.state.stats.waste).toBe(0);
  });

  it('practice widens the just-right window, up to a limit', () => {
    const { g } = setup();
    expect(justRight(g.state, g.content, indomie)).toEqual({ from: ideal - window, to: ideal + window });
    g.state.skill['indomie-goreng'] = 4 * content.balance.cooking.practicePerMinute;
    expect(practiceBonus(g.state, g.content, 'indomie-goreng')).toBe(content.balance.cooking.maxPractice);
    expect(justRight(g.state, g.content, indomie).to).toBe(ideal + window + content.balance.cooking.maxPractice);
  });

  it('each perfect plate counts as practice, a bad one does not', () => {
    expect(plateAt(ideal).g.state.skill['indomie-goreng']).toBe(1);
    expect(plateAt(ideal + 10).g.state.skill['indomie-goreng']).toBeUndefined();
  });
});

describe('auto-cook and walking away', () => {
  it('auto-cook plates itself later at plain quality, and cannot be plated by hand', () => {
    const { g, c } = setup();
    send(g, { type: 'startCook', item: 'indomie-goreng', auto: true });
    expect(send(g, { type: 'plate', burner: 0 })).toEqual({ ok: false, error: 'auto_cooking' });
    const long = Math.ceil(ideal * content.balance.cooking.autoMul);
    wait(g, long - 1);
    expect(c.tray).toEqual({});
    wait(g, 1);
    expect(c.tray).toEqual({ 'indomie-goreng': 1 });
    expect(c.cooked['indomie-goreng'][0].quality).toBe('biasa');
    expect(g.state.skill['indomie-goreng']).toBeUndefined();
  });

  it('a customer who leaves wastes what was on the stove and on the tray', () => {
    const { g } = setup(2);
    send(g, { type: 'startCook', item: 'indomie-goreng', auto: false });
    send(g, { type: 'startCook', item: 'indomie-goreng', auto: false });
    wait(g, ideal);
    send(g, { type: 'plate', burner: 0 });
    const cost = g.state.burners[1]!.cost + g.state.line[0].cooked['indomie-goreng'][0].cost;
    g.state.line[0].patience = 1;
    wait(g, 1);
    expect(g.state.line).toHaveLength(0);
    expect(g.state.burners.every((b) => b === null)).toBe(true);
    expect(g.state.stats.waste).toBeCloseTo(cost, 6);
  });

  it('declining a dish takes it off the stove', () => {
    const { g } = setup();
    send(g, { type: 'startCook', item: 'indomie-goreng', auto: false });
    send(g, { type: 'declineItem', itemId: 'indomie-goreng' });
    expect(g.state.burners.every((b) => b === null)).toBe(true);
    expect(g.state.stats.waste).toBeGreaterThan(0);
  });

  it('closing the shop clears the stove', () => {
    const { g } = setup();
    send(g, { type: 'startCook', item: 'indomie-goreng', auto: false });
    send(g, { type: 'closeWarung' });
    expect(g.state.burners.every((b) => b === null)).toBe(true);
  });
});
