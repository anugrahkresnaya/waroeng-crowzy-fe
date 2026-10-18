import { describe, expect, it } from 'vitest';
import { content } from './content';
import { freezerHoldHours, freezerRoom, freezerUsed } from './freezer';
import { Game } from './game';
import { ingredientQty, quoteOrder } from './market';
import { replay } from './replay';
import { kitchenContent, passDay } from './testing/fixtures';
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
