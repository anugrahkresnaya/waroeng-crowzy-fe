import { describe, expect, it } from 'vitest';
import { content } from './content';
import { freezerHoldHours, freezerRoom, freezerUsed } from './freezer';
import { Game } from './game';
import { baseCostPerPortion, costPerPortion, ingredientQty, quoteOrder } from './market';
import { batchesPossible } from './kitchen';
import { replay } from './replay';
import { kitchenContent, passDay, stockUp } from './testing/fixtures';
import type { Command } from './types';

const m = content.market;
const o = content.balance.outage;

/** Content with no random power cuts, so a test decides when the power goes. */
const calm = () => {
  const c = kitchenContent();
  return { ...c, balance: { ...c.balance, outage: { ...c.balance.outage, chancePerDay: 0 } } };
};
const idle = (freezer = false) => {
  const g = new Game(calm(), { seed: 1 });
  g.state.token = 1e9;
  if (freezer) {
    g.state.bank = 1e9;
    g.dispatch({ type: 'buyFreezer' });
  }
  return g;
};
const orderFrozen = (qty = 1, key = 'g-nugget'): Command => ({ type: 'placeOrder', supplier: 'pak-slamet', lines: [{ key, qty }], express: false });
const types = (events: Array<{ type: string }>) => events.map((e) => e.type);
const storedOf = (g: Game, id: string) => g.state.pantry.filter((l) => l.ingredient === id).map((l) => l.stored);

describe('buying the freezer', () => {
  it('costs money once, and moves what freezes well into it', () => {
    const g = idle();
    expect(storedOf(g, 'ayam')).toEqual(['fridge']);
    const bank = g.state.bank;
    g.state.bank = m.freezerPrice;
    const res = g.dispatch({ type: 'buyFreezer' });
    expect(res).toMatchObject({ ok: true, events: [{ type: 'freezer_bought', price: m.freezerPrice }] });
    expect(g.state.bank).toBe(0);
    expect(g.state.freezer).toBe(true);
    expect(storedOf(g, 'ayam')).toEqual(['freezer']);
    expect(storedOf(g, 'es-batu')).toEqual(['freezer']);
    expect(g.dispatch({ type: 'buyFreezer' })).toEqual({ ok: false, error: 'already_owned' });
    expect(bank).toBeGreaterThan(0);
  });

  it('is refused without the money, leaving state alone', () => {
    const g = idle();
    g.state.bank = m.freezerPrice - 100;
    const before = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'buyFreezer' })).toEqual({ ok: false, error: 'insufficient_funds' });
    expect(JSON.stringify(g.state)).toBe(before);
  });

  it('holds only so many slots; the rest of the ice and chicken stay in the fridge or on the shelf', () => {
    const g = idle(true);
    g.state.pantry.push({ ingredient: 'es-batu', qty: 40000, bought: 0, unitCost: 1.5, stored: 'room' });
    g.dispatch({ type: 'buyFreezer' }); // already owned, but storage is reassigned on the next purchase or night
    passDay(g);
    expect(freezerUsed(g.state, g.content)).toBeLessThanOrEqual(m.freezerCapacity + 1e-9);
  });
});

describe('chicken in the freezer', () => {
  const keptDays = (freezer: boolean) => {
    const g = idle(freezer);
    g.state.pantry = [{ ingredient: 'ayam', qty: 1000, bought: 0, unitCost: 39, stored: freezer ? 'freezer' : 'fridge' }];
    let kept = 0;
    for (let i = 0; i < 40; i++) {
      passDay(g);
      if (g.state.pantry.some((l) => l.ingredient === 'ayam')) kept = i;
    }
    return kept;
  };

  it('keeps for about a month, against two days in the fridge', () => {
    expect(keptDays(true)).toBe(content.ingredientById.ayam.life.freezer! - 1);
    expect(keptDays(false)).toBeLessThan(3);
  });
});

describe('ordering frozen goods', () => {
  it('needs a freezer', () => {
    const g = idle();
    const before = JSON.stringify(g.state);
    expect(g.dispatch(orderFrozen())).toEqual({ ok: false, error: 'needs_freezer' });
    expect(JSON.stringify(g.state)).toBe(before);
  });

  it('costs the cold-transport fee once, however many frozen lines there are', () => {
    const g = idle(true);
    const quote = (lines: Array<{ key: string; qty: number }>) => quoteOrder(g.state, g.content, 'pak-slamet', lines, true); // express: a flat fee, so only the cold fee differs
    const plain = quote([{ key: 'tisu', qty: 3 }]);
    const one = quote([{ key: 'tisu', qty: 3 }, { key: 'g-nugget', qty: 1 }]);
    const two = quote([{ key: 'tisu', qty: 3 }, { key: 'g-nugget', qty: 1 }, { key: 'g-sosis', qty: 1 }]);
    expect(plain.cold).toBe(0);
    expect(one.cold).toBe(m.ordering.frozenFee);
    expect(two.cold).toBe(m.ordering.frozenFee);
    expect(one.fee).toBe(plain.fee + m.ordering.frozenFee);
    expect(two.fee).toBe(one.fee);
  });

  it('goes into the freezer on arrival and sells like any other good', () => {
    const g = idle(true);
    const before = freezerUsed(g.state, g.content);
    expect(g.dispatch(orderFrozen(2)).ok).toBe(true);
    passDay(g);
    passDay(g);
    const pack = content.itemById.nugget.pack!;
    expect(g.state.stock.nugget).toBe(2 * pack);
    expect(freezerUsed(g.state, g.content)).toBeCloseTo(before + 2 * pack * content.itemById.nugget.frozen!.slots, 6);
  });

  it('loses what does not fit when it arrives, and says so', () => {
    const g = idle(true);
    g.state.stock.sosis = Math.floor(freezerRoom(g.state, g.content) / content.itemById.sosis.frozen!.slots) - 2; // two slots left
    expect(g.dispatch(orderFrozen(1, 'g-nugget')).ok).toBe(true);
    let lost: { pieces: number } | undefined;
    for (let i = 0; i < 3 && !lost; i++) lost = passDay(g).find((e) => e.type === 'frozen_lost') as { pieces: number } | undefined;
    expect(lost?.pieces).toBe(content.itemById.nugget.pack! - 2);
    expect(g.state.stock.nugget).toBe(2);
    expect(g.state.stats.waste).toBeGreaterThan(0); // counted on the morning it arrived
  });

  it('cannot be bought on a pasar trip without a freezer or room for it, and a refusal changes nothing', () => {
    const g = idle();
    g.state.phase = 'dayoff';
    g.state.blockIndex = 0;
    const block = g.content.balance.offBlocks[0].id;
    g.state.offPlan[block] = ['ke-pasar'];
    const trip: Command = { type: 'pasarTrip', lines: [{ key: 'g-nugget', qty: 1 }] };
    const before = JSON.stringify(g.state);
    expect(g.dispatch(trip)).toEqual({ ok: false, error: 'needs_freezer' });
    expect(JSON.stringify(g.state)).toBe(before);
    g.state.freezer = true;
    g.state.stock.sosis = Math.floor(m.freezerCapacity / content.itemById.sosis.frozen!.slots);
    const full = JSON.stringify(g.state);
    expect(g.dispatch(trip)).toEqual({ ok: false, error: 'freezer_full' });
    expect(JSON.stringify(g.state)).toBe(full);
  });
});

describe('who asks for frozen goods', () => {
  const frozenInLine = (freezer: boolean) => {
    let count = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const c = kitchenContent(content, { arrivalPerMinute: { morning: 1, lunch: 1, afternoon: 1, evening: 1, night: 1 } });
      const g = new Game(c, { seed });
      g.state.freezer = freezer;
      g.dispatch({ type: 'open', prepared: true });
      for (let i = 0; i < 60; i++) g.tick();
      for (const cu of g.state.line) for (const l of cu.order) if (g.content.itemById[l.itemId].frozen) count++;
    }
    return count;
  };

  it('nobody, without a freezer; some customers, with one', () => {
    expect(frozenInLine(false)).toBe(0);
    expect(frozenInLine(true)).toBeGreaterThan(0);
  });
});

describe('a power cut and the freezer', () => {
  /** A freezer filled to `share` of its slots with sosis, and a cut of `hours` today, then the night. */
  function cutWith(share: number, hours: number, ice = false) {
    const g = idle(true);
    g.state.pantry = [];
    g.state.stock.sosis = Math.round((m.freezerCapacity * share) / content.itemById.sosis.frozen!.slots);
    g.state.goodsCost.sosis = 5600;
    g.state.outage = { day: g.state.day, from: 480, hours, known: false, ice };
    return g;
  }

  it('holds a day when well filled and much less when nearly empty', () => {
    expect(freezerHoldHours(cutWith(o.freezerWellFilled, 2).state, content)).toBe(o.freezerHoldHours);
    expect(freezerHoldHours(cutWith(0.1, 2).state, content)).toBe(o.freezerPartialHours);
  });

  it('a well-filled freezer comes through the longest cut; a thin one loses everything', () => {
    const full = cutWith(0.8, 8);
    passDay(full);
    expect(full.state.stock.sosis).toBeGreaterThan(0);
    expect(full.state.lastSpoiled).toEqual([]);

    const thin = cutWith(0.1, 8);
    const pieces = thin.state.stock.sosis;
    const events = passDay(thin);
    expect(thin.state.stock.sosis).toBe(0);
    expect(thin.state.lastSpoiled).toEqual([{ ingredient: 'sosis', qty: pieces, value: pieces * 5600, good: true }]);
    expect(types(events)).toContain('spoiled');
  });

  it('ice bought in the cut saves a thin freezer', () => {
    const g = cutWith(0.1, o.freezerPartialHours + o.ice.holdHours, true);
    passDay(g);
    expect(g.state.stock.sosis).toBeGreaterThan(0);
    const bare = cutWith(0.1, o.freezerPartialHours + o.ice.holdHours, false);
    passDay(bare);
    expect(bare.state.stock.sosis).toBe(0);
  });

  it('frozen chicken spoils like room-temperature chicken once the freezer fails', () => {
    const g = cutWith(0.1, 8);
    g.state.pantry = [{ ingredient: 'ayam', qty: 1000, bought: g.state.day, unitCost: 39, stored: 'freezer' }];
    g.state.pantry[0].bought = g.state.day - 2;
    passDay(g);
    expect(ingredientQty(g.state, 'ayam')).toBe(0);
  });

  it('an empty token for most of a day also thaws a thin freezer', () => {
    const g = cutWith(0.1, 1);
    g.state.outage = null;
    g.state.token = 0;
    passDay(g);
    expect(g.state.stock.sosis).toBe(0);
  });
});

describe('replay', () => {
  it('rebuilds a run with a freezer purchase and a frozen order', () => {
    const c = calm();
    const g = new Game(c, { seed: 2 });
    g.dispatch({ type: 'buyFreezer' });
    g.dispatch(orderFrozen(2));
    passDay(g);
    passDay(g);
    const again = replay(c, 2, g.log);
    expect(again.state.stock.nugget).toBe(g.state.stock.nugget);
    expect(JSON.stringify(again.state) === JSON.stringify(g.state)).toBe(true);
  });
});

describe('nugget goreng: a frozen good as an ingredient', () => {
  const item = content.itemById['nugget-goreng'];
  const per = item.recipeGoods!.nugget;
  const ready = (nuggets: number) => {
    const g = idle(true);
    stockUp(g, 'minyak');
    stockUp(g, 'lpg');
    g.state.stock.nugget = nuggets;
    g.state.goodsCost.nugget = 30000;
    return g;
  };

  it('needs the nuggets in stock', () => {
    const g = ready(0);
    expect(g.dispatch({ type: 'cookBatch', item: 'nugget-goreng', batches: 1 })).toEqual({ ok: false, error: 'missing_ingredients' });
    expect(batchesPossible(g.state, g.content, item)).toBe(0);
  });

  it('uses whole bags for a batch and carries their cost into the portions', () => {
    const g = ready(2);
    expect(batchesPossible(g.state, g.content, item)).toBe(2);
    const r = g.dispatch({ type: 'cookBatch', item: 'nugget-goreng', batches: 1 });
    expect(r.ok).toBe(true);
    expect(g.state.stock.nugget).toBe(2 - per * item.batch!.portions);
    const batch = g.state.display['nugget-goreng'][0];
    expect(batch.qty).toBe(item.batch!.portions);
    expect(batch.unitCost).toBeGreaterThanOrEqual((30000 * per * item.batch!.portions) / item.batch!.portions);
  });

  it('is part of the plate cost shown on the menu', () => {
    const g = ready(1);
    const withGood = costPerPortion(g.state, g.content, item);
    expect(withGood).toBeGreaterThan(0);
    expect(baseCostPerPortion(g.content, item)).toBeGreaterThanOrEqual(per * (content.itemById.nugget.buyPrice ?? 0));
  });

  it('is only asked for in a warung with a freezer', () => {
    const asked = (freezer: boolean) => {
      const g = new Game(content, { seed: 3 });
      g.state.token = 1e9;
      if (freezer) {
        g.state.bank = 1e9;
        g.dispatch({ type: 'buyFreezer' });
      }
      g.dispatch({ type: 'open', prepared: false });
      const seen = new Set<string>();
      for (let i = 0; i < 900 && g.state.phase === 'open'; i++) {
        g.tick();
        g.state.line = g.state.line.slice(0, 4);
        for (const c of g.state.line) for (const l of c.order) seen.add(l.itemId);
      }
      return seen;
    };
    expect(asked(false).has('nugget-goreng')).toBe(false);
    expect(asked(true).has('nugget-goreng')).toBe(true);
  });
});

describe('a pasar trip before opening on a work day', () => {
  const m = content.market.pasar;
  const open = () => {
    const g = new Game(calm(), { seed: 1 });
    g.state.token = 1e9;
    g.state.bank = 1e8;
    g.state.shelfLevel = 2;
    return g;
  };
  const buyNuggets = (g: Game) => g.dispatch({ type: 'pasarTrip', lines: [{ key: 'g-nugget', qty: 1 }] });

  it('costs pre-open time, once, and only before opening', () => {
    const g = open();
    expect(g.dispatch({ type: 'pasarTrip', lines: [{ key: 'beras', qty: 1 }] })).toEqual({ ok: false, error: 'no_pasar_trip' });
    expect(g.dispatch({ type: 'startPasarTrip' }).ok).toBe(true);
    expect(g.state.preOpenUsed).toBe(m.tripMinutes);
    expect(g.dispatch({ type: 'startPasarTrip' })).toEqual({ ok: false, error: 'trip_done' });
    expect(g.dispatch({ type: 'pasarTrip', lines: [{ key: 'beras', qty: 1 }] }).ok).toBe(true);
    g.dispatch({ type: 'open', prepared: false });
    expect(g.dispatch({ type: 'pasarTrip', lines: [{ key: 'beras', qty: 1 }] })).toEqual({ ok: false, error: 'no_pasar_trip' });
  });

  it('uses the time the shelves would need: after a trip the shop opens unprepared, or not at all prepared', () => {
    const g = open();
    g.dispatch({ type: 'startPasarTrip' });
    expect(g.dispatch({ type: 'open', prepared: true }).ok).toBe(false);
    expect(g.dispatch({ type: 'open', prepared: false }).ok).toBe(true);
    const h = open();
    h.state.preOpenUsed = h.content.balance.preOpenMinutes - m.tripMinutes + 1;
    expect(h.dispatch({ type: 'startPasarTrip' })).toEqual({ ok: false, error: 'no_time' });
  });

  it('lets frozen goods in without a freezer, to be sold before they melt', () => {
    const g = open();
    g.dispatch({ type: 'startPasarTrip' });
    expect(buyNuggets(g).ok).toBe(true);
    const pieces = g.state.stock.nugget;
    expect(pieces).toBe(content.itemById.nugget.pack);
    expect(g.state.melt).toHaveLength(1);
    g.dispatch({ type: 'open', prepared: false });
    expect(g.state.stock.nugget).toBe(pieces);
    // sell some, then the rest melts at the deadline
    g.state.stock.nugget -= 2;
    g.state.minute = g.state.melt[0].at - g.state.day * 1440 - 1;
    g.tick();
    expect(g.state.stock.nugget).toBe(0);
    expect(g.state.melt).toHaveLength(0);
    expect(g.state.stats.waste).toBeGreaterThan(0);
  });

  it('cooking the nuggets into nugget goreng before opening saves them', () => {
    const g = open();
    stockUp(g, 'minyak');
    stockUp(g, 'lpg');
    g.dispatch({ type: 'startPasarTrip' });
    buyNuggets(g);
    expect(g.dispatch({ type: 'cookBatch', item: 'nugget-goreng', batches: 1 }).ok).toBe(true);
    expect(g.state.display['nugget-goreng'][0].qty).toBe(10);
  });

  it('a day-off trip still needs a freezer for frozen goods', () => {
    const g = open();
    g.state.workDays = [true, true, true, true, true, true, false];
    g.state.phase = 'dayoff';
    g.state.blockIndex = 0;
    g.state.offPlan = { [content.balance.offBlocks[0].id]: ['ke-pasar'] };
    expect(buyNuggets(g)).toEqual({ ok: false, error: 'needs_freezer' });
  });

  it('a new day clears the trip and anything left to melt', () => {
    const g = open();
    g.dispatch({ type: 'startPasarTrip' });
    buyNuggets(g);
    passDay(g);
    expect(g.state.tripToday).toBe(false);
    expect(g.state.melt).toEqual([]);
    expect(g.state.stock.nugget).toBe(0);
  });

  it('is asked for in the shop while the nuggets are there, even without a freezer', () => {
    const g = new Game(content, { seed: 3 });
    g.state.token = 1e9;
    g.state.bank = 1e8;
    g.state.shelfLevel = 2;
    g.dispatch({ type: 'startPasarTrip' });
    g.dispatch({ type: 'pasarTrip', lines: [{ key: 'g-nugget', qty: 1 }, { key: 'g-dimsum', qty: 1 }] });
    g.dispatch({ type: 'open', prepared: false });
    const seen = new Set<string>();
    for (let i = 0; i < 280 && g.state.phase === 'open'; i++) {
      g.tick();
      g.state.line = g.state.line.slice(0, 4);
      for (const c of g.state.line) for (const l of c.order) seen.add(l.itemId);
    }
    expect([...seen].some((id) => id === 'nugget' || id === 'dimsum')).toBe(true);
  });
});
