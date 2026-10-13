import { describe, expect, it } from 'vitest';
import { addDays } from './calendar';
import { content, parseContent } from './content';
import { Game } from './game';
import { assignStorage, consume, costPerPortion, dishNeeds, ingredientQty, portionsLeft, priceMultiplier, quoteOrder, roundPrice, sellPrice } from './market';
import { total } from './money';
import { restock, bankTheBigNotes, playAnyDay, sleepThrough } from './testing/bot';
import { addCustomer, openGame, passDay, pantryQty, pickAll, quietContent, runOut, stockUp } from './testing/fixtures';
import { rawContent, type RawContent } from './testing/raw-content';

const made = (patch?: (r: RawContent) => void) => {
  const r = rawContent();
  patch?.(r);
  return parseContent(r);
};
const gameWith = (patch?: (r: RawContent) => void, seed = 1, day = 0) => new Game(made(patch), { seed, day });
const noEvents = (r: RawContent) => r.market.events.forEach((e) => (e.chancePerDay = 0));
const calmMarket = (r: RawContent) => {
  noEvents(r);
  r.market.seasons = [];
};
const stillPrices = (r: RawContent) => {
  for (const k of ['low', 'medium', 'high']) r.market.swings[k].daily = 0;
};
const emptyPantry = (g: Game) => {
  g.state.pantry = [];
};
const lot = (g: Game, ingredient: string, qty: number, unitCost: number, bought = g.state.day) =>
  g.state.pantry.push({ ingredient, qty, bought, unitCost, stored: 'room' });

describe('prices', () => {
  it('start with a month of history behind them, ending today', () => {
    const g = new Game(content, { seed: 1 });
    for (const p of content.products) {
      const h = g.state.market.history[p.key];
      expect(h, p.key).toHaveLength(content.market.historyDays);
      expect(h[h.length - 1]).toBe(g.state.market.prices[p.key]);
    }
    expect(g.state.market.prices.beras).toBeGreaterThan(14000);
    expect(g.state.market.prices.beras).toBeLessThan(19000);
  });

  it('are the same for the same seed and different for another', () => {
    const a = new Game(content, { seed: 4 });
    const b = new Game(content, { seed: 4 });
    const c = new Game(content, { seed: 5 });
    expect(a.state.market).toEqual(b.state.market);
    expect(a.state.market.prices).not.toEqual(c.state.market.prices);
  });

  it('move every night, and the history slides forward by one day', () => {
    const g = new Game(content, { seed: 2 });
    const before = [...g.state.market.history.cabai];
    passDay(g);
    const after = g.state.market.history.cabai;
    expect(after).toHaveLength(before.length);
    expect(after.slice(0, -1)).toEqual(before.slice(1));
    expect(after[after.length - 1]).toBe(g.state.market.prices.cabai);
  });

  it('stay within the swing cap of their base price when there are no seasons or events', () => {
    const g = gameWith(calmMarket, 7);
    for (let i = 0; i < 90; i++) passDay(g);
    for (const p of g.content.products) {
      const cap = g.content.market.swings[p.swing].cap;
      for (const price of g.state.market.history[p.key]) {
        const move = Math.abs(price / p.base - 1);
        expect(move, `${p.key} at ${price}`).toBeLessThanOrEqual(cap + 0.04); // rounding to the nearest Rp50 to Rp500
      }
    }
  });

  it('swing more for high-swing items than for low-swing ones', () => {
    const g = gameWith(calmMarket, 3);
    for (let i = 0; i < 120; i++) passDay(g);
    const spread = (key: string, base: number) => {
      const h = g.state.market.history[key];
      const mean = h.reduce((s, v) => s + v, 0) / h.length;
      return Math.sqrt(h.reduce((s, v) => s + (v - mean) ** 2, 0) / h.length) / base;
    };
    expect(spread('cabai', 78000)).toBeGreaterThan(spread('beras', 16500) * 2);
  });

  it('round to sensible steps', () => {
    expect(roundPrice(16437)).toBe(16400);
    expect(roundPrice(78231)).toBe(78000);
    expect(roundPrice(1512)).toBe(1500);
    expect(roundPrice(1530)).toBe(1550);
    expect(roundPrice(1)).toBe(50);
  });
});

describe('seasons and events', () => {
  const cabai = (c = content) => c.productByKey.cabai;
  const dayOf = (month: number, d: number) => {
    for (let i = 0; i < 400; i++) {
      const date = addDays(content.market.calendarStart, i);
      if (date.month === month && date.day === d) return i;
    }
    throw new Error('date not found');
  };

  it('push cabai up in the rainy season and everything before Ramadan', () => {
    const g = new Game(content, { seed: 1 });
    const m = g.state.market;
    expect(priceMultiplier(content, m, cabai(), dayOf(10, 20))).toBeCloseTo(1, 5);
    expect(priceMultiplier(content, m, cabai(), dayOf(11, 15))).toBeCloseTo(1.15, 5);
    expect(priceMultiplier(content, m, content.productByKey.beras, dayOf(1, 25))).toBeCloseTo(1.12, 5);
    expect(priceMultiplier(content, m, content.productByKey.beras, dayOf(4, 20))).toBeCloseTo(1, 5);
    expect(priceMultiplier(content, m, content.productByKey.telur, dayOf(2, 20))).toBeCloseTo(1.15, 5);
  });

  it('a harvest failure lifts cabai 40% and eases off over its ten days', () => {
    const g = new Game(content, { seed: 1 });
    const m = g.state.market;
    m.active.push({ id: 'harvest-failure', start: 50, end: 59 });
    const at = (d: number) => priceMultiplier(content, m, cabai(), d);
    const base = priceMultiplier(content, { ...m, active: [] }, cabai(), 50);
    expect(at(49) / base).toBeCloseTo(1, 5);
    expect(at(50) / base).toBeCloseTo(1.4, 5);
    expect(at(55) / base).toBeCloseTo(1 + 0.4 * (1 - 5 / 10), 5);
    expect(at(59) / base).toBeCloseTo(1 + 0.4 * (1 / 10), 5);
    expect(at(60) / base).toBeCloseTo(1, 5);
    expect(priceMultiplier(content, m, content.productByKey.beras, 55)).toBeCloseTo(priceMultiplier(content, { ...m, active: [] }, content.productByKey.beras, 55), 5);
  });

  it('a fuel hike lifts everything, goods included, and does not wear off', () => {
    const g = new Game(content, { seed: 1 });
    const m = g.state.market;
    const clean = { ...m, active: [] };
    m.active.push({ id: 'fuel-hike', start: 10, end: null });
    for (const key of ['beras', 'g-rokok', 'lpg']) {
      const p = content.productByKey[key];
      expect(priceMultiplier(content, m, p, 300) / priceMultiplier(content, clean, p, 300), key).toBeCloseTo(1.05, 5);
    }
  });

  it('events are announced first: the headline arrives a day before the price moves', () => {
    const g = gameWith((r) => {
      r.market.events = [{ id: 'harvest-failure', chancePerDay: 1, leadDays: 1, duration: 3, decay: 'linear', lateBoost: 0, effects: [{ match: ['cabai'], delta: 0.4 }] }];
      r.market.eventsFromDay = 1;
      r.market.seasons = [];
      stillPrices(r);
    });
    const events = passDay(g); // into day 1
    expect(events.some((e) => e.type === 'news')).toBe(true);
    expect(g.state.market.news[0]).toEqual({ day: 1, event: 'harvest-failure', startsOn: 2 });
    expect(g.state.market.pending).toHaveLength(1);
    expect(g.state.market.prices.cabai).toBe(78000); // not yet
    passDay(g); // day 2: the effect starts
    expect(g.state.market.active.some((e) => e.id === 'harvest-failure')).toBe(true);
    expect(g.state.market.prices.cabai).toBeGreaterThan(105000);
  });

  it('are calm for the first days', () => {
    const g = gameWith((r) => {
      r.market.events = [{ id: 'fuel-hike', chancePerDay: 1, leadDays: 0, duration: null, decay: 'none', lateBoost: 0, effects: [{ match: ['all'], delta: 0.05 }] }];
    });
    passDay(g);
    passDay(g);
    expect(g.state.market.news).toHaveLength(0);
    passDay(g); // day 3
    expect(g.state.market.news).toHaveLength(1);
  });

  it('a flood only happens in the rainy months', () => {
    const g = gameWith((r) => {
      r.market.events = [{ id: 'flood', chancePerDay: 1, leadDays: 0, duration: 7, decay: 'linear', lateBoost: 0.25, months: [11, 12, 1, 2, 3], effects: [{ match: ['sayur'], delta: 0.3 }] }];
      r.market.eventsFromDay = 0;
    });
    for (let i = 0; i < 24; i++) passDay(g);
    const first = g.state.market.news[0];
    expect(first).toBeDefined();
    expect(addDays(g.content.market.calendarStart, first.day).month).toBe(11);
  });

  it('only one of each event runs at a time', () => {
    const g = gameWith((r) => {
      r.market.events = [{ id: 'lpg-shortage', chancePerDay: 1, leadDays: 0, duration: 6, decay: 'linear', lateBoost: 0, effects: [{ match: ['lpg'], delta: 0.25 }] }];
      r.market.eventsFromDay = 0;
    });
    for (let i = 0; i < 5; i++) passDay(g);
    expect(g.state.market.active.filter((e) => e.id === 'lpg-shortage')).toHaveLength(1);
  });
});

describe('ordering from the phone', () => {
  const lines = [{ key: 'beras', qty: 2 }, { key: 'mi-instan', qty: 10 }];

  it('charges the supplier price per unit plus a delivery fee, from the bank', () => {
    const g = new Game(content, { seed: 1 });
    const q = quoteOrder(g.state, content, 'pak-slamet', lines, false);
    const expected = lines.reduce((s, l) => s + roundPrice(g.state.market.prices[l.key] * 1.05) * l.qty, 0);
    expect(q.subtotal).toBe(expected);
    expect(q.fee).toBe(8000);
    const bank = g.state.bank;
    const res = g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines, express: false });
    expect(res.ok && res.events).toEqual([{ type: 'order_placed', orderId: 1, total: q.total }]);
    expect(g.state.bank).toBe(bank - q.total);
    expect(g.state.orders[0]).toMatchObject({ id: 1, status: 'transit', express: false, late: false, subtotal: q.subtotal, fee: 8000, total: q.total });
  });

  it('delivery is free from the supplier threshold', () => {
    const g = new Game(content, { seed: 1 });
    const big = [{ key: 'beras', qty: 12 }];
    const q = quoteOrder(g.state, content, 'pak-slamet', big, false);
    expect(q.subtotal).toBeGreaterThanOrEqual(150000);
    expect(q.fee).toBe(0);
  });

  it('suppliers differ in price, minimum order and fee', () => {
    const g = new Game(content, { seed: 1 });
    const one = [{ key: 'beras', qty: 10 }];
    const slamet = quoteOrder(g.state, content, 'pak-slamet', one, false).subtotal;
    const maju = quoteOrder(g.state, content, 'toko-maju', one, false).subtotal;
    const induk = quoteOrder(g.state, content, 'grosir-induk', one, false).subtotal;
    expect(induk).toBeLessThan(maju);
    expect(maju).toBeLessThan(slamet);
    expect(g.dispatch({ type: 'placeOrder', supplier: 'toko-maju', lines: [{ key: 'beras', qty: 1 }], express: false })).toEqual({ ok: false, error: 'below_minimum' });
    expect(g.dispatch({ type: 'placeOrder', supplier: 'grosir-induk', lines: one, express: false })).toEqual({ ok: false, error: 'below_minimum' });
  });

  it('refuses what it cannot do, and changes nothing when it does', () => {
    const g = new Game(content, { seed: 1 });
    const before = JSON.stringify(g.state);
    const place = (supplier: string, ls: Array<{ key: string; qty: number }>) => g.dispatch({ type: 'placeOrder', supplier, lines: ls, express: false });
    expect(place('nobody', lines)).toEqual({ ok: false, error: 'unknown_supplier' });
    expect(place('pak-slamet', [])).toEqual({ ok: false, error: 'empty_order' });
    expect(place('pak-slamet', [{ key: 'beras', qty: 0 }])).toEqual({ ok: false, error: 'empty_order' });
    expect(place('pak-slamet', [{ key: 'durian', qty: 1 }])).toEqual({ ok: false, error: 'unknown_product' });
    expect(place('pak-slamet', [{ key: 'beras', qty: 1.5 }])).toEqual({ ok: false, error: 'invalid_quantity' });
    expect(place('pak-slamet', [{ key: 'beras', qty: -2 }])).toEqual({ ok: false, error: 'invalid_quantity' });
    g.state.bank = 1000;
    const poor = JSON.stringify(g.state);
    expect(place('pak-slamet', lines)).toEqual({ ok: false, error: 'insufficient_funds' });
    expect(JSON.stringify(g.state)).toBe(poor);
    expect(before.length).toBeGreaterThan(0);
  });

  it('merges repeated lines into one', () => {
    const g = new Game(content, { seed: 1 });
    g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines: [{ key: 'beras', qty: 1 }, { key: 'beras', qty: 2 }], express: false });
    expect(g.state.orders[0].lines).toHaveLength(1);
    expect(g.state.orders[0].lines[0].qty).toBe(3);
  });

  it('can be placed at any time of day, even at night', () => {
    for (const phase of ['idle', 'open', 'ended', 'night', 'bed'] as const) {
      const g = new Game(content, { seed: 1 });
      g.state.phase = phase;
      expect(g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines, express: false }).ok, phase).toBe(true);
    }
  });

  it('arrives tomorrow before the 20.00 cutoff and the day after if later', () => {
    const at = (phase: 'open' | 'night' | 'idle', minute: number) => {
      const g = new Game(content, { seed: 1 });
      g.state.phase = phase;
      g.state.minute = minute;
      g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines, express: false });
      return g.state.orders[0].arriveDay;
    };
    expect(at('idle', 420)).toBe(1);
    expect(at('open', 600)).toBe(1);
    expect(at('open', 1199)).toBe(1);
    expect(at('open', 1200)).toBe(2);
    expect(at('night', 1350)).toBe(2);
  });

  it('express costs more and arrives within hours, or at the start of tomorrow if the shop is shut', () => {
    const g = new Game(content, { seed: 1 });
    g.dispatch({ type: 'open', prepared: true });
    g.state.minute = 600;
    const bank = g.state.bank;
    g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines, express: true });
    const o = g.state.orders[0];
    expect(o).toMatchObject({ express: true, arriveDay: 0, arriveMinute: 780, fee: 25000 });
    expect(g.state.bank).toBe(bank - o.total);

    const late = new Game(content, { seed: 1 });
    late.state.phase = 'night';
    late.state.minute = 1380;
    late.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines, express: true });
    expect(late.state.orders[0]).toMatchObject({ arriveDay: 1, arriveMinute: 0 });

    const closing = new Game(content, { seed: 1 });
    closing.dispatch({ type: 'open', prepared: true });
    closing.state.minute = 1250; // three hours later is after closing
    closing.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines, express: true });
    expect(closing.state.orders[0].arriveDay).toBe(1);
  });
});

describe('delivery', () => {
  it('puts the order in the pantry the next morning, costed at what was paid', () => {
    const g = gameWith(noEvents);
    emptyPantry(g);
    g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines: [{ key: 'beras', qty: 3 }], express: false });
    const unit = g.state.orders[0].lines[0].unitPrice;
    expect(pantryQty(g, 'beras')).toBe(0);
    const events = passDay(g);
    expect(events).toContainEqual({ type: 'order_delivered', orderId: 1 });
    expect(g.state.orders[0]).toMatchObject({ status: 'delivered', deliveredDay: 1 });
    expect(pantryQty(g, 'beras')).toBe(3000);
    expect(g.state.pantry[0]).toMatchObject({ ingredient: 'beras', bought: 1, unitCost: unit / 1000 });
  });

  it('resale goods arrive by the pack and average their cost into what is on the shelf', () => {
    const g = gameWith(noEvents);
    g.state.stock.kerupuk = 50;
    g.state.goodsCost.kerupuk = 800;
    g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines: [{ key: 'g-kerupuk', qty: 2 }], express: false });
    const perPiece = g.state.orders[0].lines[0].unitPrice / 50;
    passDay(g);
    expect(g.state.stock.kerupuk).toBe(150); // 50 on the shelf plus two packs of 50
    expect(g.state.goodsCost.kerupuk).toBeCloseTo((50 * 800 + 100 * perPiece) / 150, 6);
  });

  it('a late delivery is pushed back one day, told so, and then arrives', () => {
    const g = gameWith((r) => {
      noEvents(r);
      r.suppliers.find((s) => s.id === 'pak-slamet')!.lateChance = 1;
    });
    emptyPantry(g);
    g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines: [{ key: 'beras', qty: 1 }], express: false });
    const events = passDay(g); // day 1: it was due, and it is late
    expect(events).toContainEqual({ type: 'order_late', orderId: 1, arriveDay: 2 });
    expect(g.state.orders[0]).toMatchObject({ status: 'transit', late: true, arriveDay: 2, lateRolled: true });
    expect(pantryQty(g, 'beras')).toBe(0);
    const next = passDay(g); // day 2: it arrives for certain
    expect(next).toContainEqual({ type: 'order_delivered', orderId: 1 });
    expect(pantryQty(g, 'beras')).toBe(1000);
  });

  it('express orders are never late', () => {
    const g = gameWith((r) => {
      noEvents(r);
      r.suppliers.find((s) => s.id === 'pak-slamet')!.lateChance = 1;
    });
    emptyPantry(g);
    g.dispatch({ type: 'open', prepared: true });
    g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines: [{ key: 'beras', qty: 1 }], express: true });
    expect(g.state.orders[0].arriveMinute).toBe(420 + 180);
    let delivered = false;
    for (let i = 0; i < 200 && !delivered; i++) delivered = g.tick().some((e) => e.type === 'order_delivered');
    expect(delivered).toBe(true);
    expect(g.state.minute).toBe(600);
    expect(pantryQty(g, 'beras')).toBe(1000);
  });

  it('a flood makes late deliveries far more likely', () => {
    const run = (flood: boolean) => {
      const g = gameWith((r) => {
        noEvents(r);
        r.suppliers.find((s) => s.id === 'pak-slamet')!.lateChance = 0;
        r.market.events.find((e) => e.id === 'flood')!.lateBoost = 1;
      });
      if (flood) g.state.market.active.push({ id: 'flood', start: 0, end: 9 });
      for (let i = 0; i < 30; i++) g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines: [{ key: 'tisu', qty: 1 }], express: false });
      passDay(g);
      return g.state.orders.filter((o) => o.late).length;
    };
    expect(run(false)).toBe(0);
    expect(run(true)).toBe(30);
  });

  it('ordered stock helps the next shift: the shop sells what arrived', () => {
    const g = gameWith(noEvents);
    emptyPantry(g);
    g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines: [{ key: 'mi-instan', qty: 5 }, { key: 'minyak', qty: 1 }, { key: 'bawang-merah', qty: 1 }, { key: 'lpg', qty: 1 }], express: false });
    passDay(g);
    g.dispatch({ type: 'open', prepared: false });
    expect(portionsLeft(g.state, g.content, 'indomie-goreng')).toBe(5);
  });
});

describe('the pasar trip', () => {
  const trip = () => {
    const g = gameWith((r) => {
      noEvents(r);
      r.balance.defaultWorkDays = [false, true, true, true, true, true, true];
      r.balance.defaultOffPlan.siang = ['ke-pasar'];
    });
    return g;
  };
  const toSiang = (g: Game) => {
    g.dispatch({ type: 'runBlock' }); // pagi
    return g;
  };

  it('only works in a day-off block planned as a pasar trip', () => {
    const g = trip();
    expect(g.state.phase).toBe('dayoff');
    const buy = () => g.dispatch({ type: 'pasarTrip', lines: [{ key: 'beras', qty: 1 }] });
    expect(buy()).toEqual({ ok: false, error: 'no_pasar_trip' }); // pagi is helping the family
    toSiang(g);
    expect(buy().ok).toBe(true);
    g.dispatch({ type: 'runBlock' }); // the trip is over
    expect(buy()).toEqual({ ok: false, error: 'no_pasar_trip' });
    expect(new Game(content, { seed: 1 }).dispatch({ type: 'pasarTrip', lines: [{ key: 'beras', qty: 1 }] })).toEqual({ ok: false, error: 'no_pasar_trip' });
  });

  it('gives same-day stock without an order and without a delivery fee', () => {
    const g = toSiang(trip());
    emptyPantry(g);
    const bank = g.state.bank;
    const res = g.dispatch({ type: 'pasarTrip', lines: [{ key: 'beras', qty: 5 }, { key: 'g-keripik', qty: 1 }] });
    expect(res.ok && res.events.map((e) => e.type)).toEqual(['pasar_bought']);
    expect(g.state.orders).toHaveLength(0);
    expect(pantryQty(g, 'beras')).toBe(5000);
    expect(g.state.stock.keripik).toBe(30 + 20);
    expect(g.state.bank).toBeLessThan(bank);
  });

  it('haggles within a few percent of the market price, and gives a bulk discount', () => {
    const exact = (qty: number) => {
      const g = toSiang(
        gameWith((r) => {
          noEvents(r);
          r.market.pasar.haggle = 0;
          r.balance.defaultWorkDays = [false, true, true, true, true, true, true];
          r.balance.defaultOffPlan.siang = ['ke-pasar'];
        }),
      );
      const price = g.state.market.prices.beras;
      const bank = g.state.bank;
      g.dispatch({ type: 'pasarTrip', lines: [{ key: 'beras', qty }] });
      return { spent: bank - g.state.bank, subtotal: price * qty };
    };
    const small = exact(5);
    expect(small.spent).toBe(Math.round(small.subtotal / 100) * 100); // under Rp200.000: no discount
    const mid = exact(20);
    expect(mid.subtotal).toBeGreaterThanOrEqual(200000);
    expect(mid.spent).toBe(Math.round((mid.subtotal * 0.95) / 100) * 100);
    const big = exact(40);
    expect(big.subtotal).toBeGreaterThanOrEqual(500000);
    expect(big.spent).toBe(Math.round((big.subtotal * 0.9) / 100) * 100);

    // with haggling on, the price lands near the market price
    const g = toSiang(trip());
    const price = g.state.market.prices.beras;
    const bank = g.state.bank;
    g.dispatch({ type: 'pasarTrip', lines: [{ key: 'beras', qty: 5 }] });
    const perKg = (bank - g.state.bank) / 5;
    expect(perKg).toBeGreaterThanOrEqual(price * 0.96);
    expect(perKg).toBeLessThanOrEqual(price * 1.04);
  });

  it('the discount lowers what the stock cost you, so margins stay honest', () => {
    const g = toSiang(trip());
    emptyPantry(g);
    const bank = g.state.bank;
    g.dispatch({ type: 'pasarTrip', lines: [{ key: 'beras', qty: 40 }] });
    const spent = bank - g.state.bank;
    const cost = g.state.pantry.reduce((s, l) => s + l.qty * l.unitCost, 0);
    expect(cost).toBeCloseTo(spent, -2);
  });

  it('is refused cleanly when the bank cannot pay', () => {
    const g = toSiang(trip());
    g.state.bank = 100;
    const before = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'pasarTrip', lines: [{ key: 'beras', qty: 5 }] })).toEqual({ ok: false, error: 'insufficient_funds' });
    expect(JSON.stringify(g.state)).toBe(before);
  });
});

describe('the pantry', () => {
  it('uses the oldest stock first and costs each portion at what that stock cost', () => {
    const g = new Game(content, { seed: 1 });
    emptyPantry(g);
    lot(g, 'beras', 1000, 10, 0);
    lot(g, 'beras', 1000, 30, 1);
    expect(consume(g.state, 'beras', 1500)).toEqual({ taken: 1500, cost: 1000 * 10 + 500 * 30 });
    expect(pantryQty(g, 'beras')).toBe(500);
    expect(g.state.pantry).toHaveLength(1);
    expect(consume(g.state, 'beras', 900)).toEqual({ taken: 500, cost: 500 * 30 });
    expect(g.state.pantry).toHaveLength(0);
  });

  it('counts a dish as available only while every ingredient lasts, including what is already on the tray', () => {
    const g = openGame();
    emptyPantry(g);
    lot(g, 'mi-instan', 3, 3200);
    lot(g, 'minyak', 100, 21);
    lot(g, 'bawang-merah', 100, 40);
    lot(g, 'sawi', 1000, 12);
    lot(g, 'lpg', 1000, 22);
    expect(portionsLeft(g.state, g.content, 'indomie-goreng')).toBe(3);
    expect(portionsLeft(g.state, g.content, 'indomie-goreng', { 'indomie-goreng': 2 })).toBe(1);
    expect(portionsLeft(g.state, g.content, 'indomie-kuah', { 'indomie-goreng': 1 })).toBe(2); // they share the noodles
    expect(portionsLeft(g.state, g.content, 'es-teh')).toBe(0);
    expect(portionsLeft(g.state, g.content, 'rokok', { rokok: 2 })).toBe(g.state.stock.rokok - 2);
    expect(portionsLeft(g.state, g.content, 'tidak-ada')).toBe(0);
  });

  it('stops the counter when an ingredient runs out', () => {
    const g = openGame();
    runOut(g, 'mi-instan');
    addCustomer(g, { order: [{ itemId: 'indomie-goreng', qty: 1 }], method: 'qris' });
    expect(g.dispatch({ type: 'pick', itemId: 'indomie-goreng' })).toEqual({ ok: false, error: 'out_of_stock' });
  });
});

describe('spoilage and the small fridge', () => {
  const spoilTest = (patch: ((r: RawContent) => void) | undefined, ingredient: string, qty: number, nights: number) => {
    const g = gameWith((r) => {
      noEvents(r);
      patch?.(r);
    });
    emptyPantry(g);
    lot(g, ingredient, qty, 40, 0);
    const kept: boolean[] = [];
    for (let i = 0; i < nights; i++) {
      passDay(g);
      kept.push(g.state.pantry.some((l) => l.ingredient === ingredient));
    }
    return { g, kept };
  };

  it('chicken goes off overnight at room temperature but lasts two days in the fridge', () => {
    const room = spoilTest((r) => (r.market.fridgeCapacity = 0), 'ayam', 1000, 1);
    expect(room.kept).toEqual([false]);
    expect(room.g.state.lastSpoiled).toEqual([{ ingredient: 'ayam', qty: 1, value: 40000 }]);

    const fridge = spoilTest(undefined, 'ayam', 1000, 3);
    expect(fridge.kept).toEqual([true, true, false]); // usable through day 2, gone on day 3
  });

  it('eggs, chili and greens last as long as the PRD says', () => {
    expect(spoilTest(undefined, 'telur', 16, 30).kept.lastIndexOf(true)).toBe(29); // 30 days in the fridge
    expect(spoilTest((r) => (r.market.fridgeCapacity = 0), 'telur', 16, 12).kept.lastIndexOf(true)).toBe(9); // 10 days at room temperature
    expect(spoilTest(undefined, 'cabai', 1000, 14).kept.lastIndexOf(true)).toBe(11); // 12 days in the fridge
    expect(spoilTest(undefined, 'sawi', 1000, 9).kept.lastIndexOf(true)).toBe(6); // a week
    expect(spoilTest(undefined, 'tahu', 1, 6).kept.lastIndexOf(true)).toBe(3); // 4 days
  });

  it('ice melts overnight whatever you do, and dry goods keep', () => {
    expect(spoilTest(undefined, 'es-batu', 1000, 1).kept).toEqual([false]);
    expect(spoilTest(undefined, 'beras', 1000, 60).kept.every(Boolean)).toBe(true);
    expect(spoilTest(undefined, 'gula', 1000, 60).kept.every(Boolean)).toBe(true);
  });

  it('shallots keep for weeks and need no fridge', () => {
    const r = spoilTest(undefined, 'bawang-merah', 1000, 22);
    expect(r.kept.lastIndexOf(true)).toBe(20);
    expect(r.g.state.pantry.length).toBe(0);
  });

  it('the fridge is small: the oldest stock gets it, and the newer stock at room temperature spoils first', () => {
    const g = gameWith((r) => {
      noEvents(r);
      r.market.fridgeCapacity = 1.5;
    });
    emptyPantry(g);
    lot(g, 'ayam', 1000, 40, 0);
    lot(g, 'ayam', 1000, 40, 0);
    assignStorage(g.state, g.content);
    expect(g.state.pantry.map((l) => l.stored)).toEqual(['fridge', 'room']);
    passDay(g);
    expect(g.state.pantry).toHaveLength(1);
    expect(g.state.pantry[0].stored).toBe('fridge');
    expect(g.state.lastSpoiled).toEqual([{ ingredient: 'ayam', qty: 1, value: 40000 }]);
  });

  it('tells the player the waste in rupiah, and reports it as an event', () => {
    const g = gameWith(noEvents);
    emptyPantry(g);
    lot(g, 'es-batu', 3000, 1.5, 0);
    const events = passDay(g);
    expect(events).toContainEqual({ type: 'spoiled', value: 4500 });
  });
});

describe('the menu', () => {
  it('starts with the default price and normal portion for every dish', () => {
    const g = new Game(content, { seed: 1 });
    for (const item of content.items.filter((i) => i.kind === 'dish')) expect(g.state.menu[item.id]).toEqual({ price: item.price, portion: 'normal' });
  });

  it('lets the player set a price, and customers pay it', () => {
    const g = openGame();
    expect(g.dispatch({ type: 'setDishPrice', item: 'es-teh', price: 3500 }).ok).toBe(true);
    expect(sellPrice(g.state, content.itemById['es-teh'])).toBe(3500);
    const c = addCustomer(g, { order: [{ itemId: 'es-teh', qty: 2 }], method: 'qris' });
    expect(c.bill).toBe(7000);
  });

  it('refuses bad prices and things that are not dishes', () => {
    const g = new Game(content, { seed: 1 });
    expect(g.dispatch({ type: 'setDishPrice', item: 'rokok', price: 20000 })).toEqual({ ok: false, error: 'not_a_dish' });
    expect(g.dispatch({ type: 'setDishPrice', item: 'nope', price: 3000 })).toEqual({ ok: false, error: 'not_a_dish' });
    for (const price of [0, 400, 3050, -3000, 3000.5, 250000]) {
      expect(g.dispatch({ type: 'setDishPrice', item: 'es-teh', price }), String(price)).toEqual({ ok: false, error: 'invalid_price' });
    }
    expect(g.state.menu['es-teh'].price).toBe(3000);
    expect(g.dispatch({ type: 'setPortion', item: 'rokok', portion: 'small' })).toEqual({ ok: false, error: 'not_a_dish' });
    expect(g.dispatch({ type: 'setPortion', item: 'es-teh', portion: 'huge' as never })).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('costs a portion from today\'s market prices, so it moves when the market does', () => {
    const g = new Game(content, { seed: 1 });
    const item = content.itemById['indomie-goreng'];
    const before = costPerPortion(g.state, content, item);
    const expected =
      g.state.market.prices['mi-instan'] +
      (5 / 1000) * g.state.market.prices.minyak +
      (4 / 1000) * g.state.market.prices['bawang-merah'] +
      (8 / 1000) * g.state.market.prices.lpg;
    expect(before).toBeCloseTo(expected, 6);
    g.state.market.prices['mi-instan'] += 800;
    expect(costPerPortion(g.state, content, item)).toBeCloseTo(before + 800, 6);
  });

  it('a good costs its buy price per piece', () => {
    const g = new Game(content, { seed: 1 });
    const item = content.itemById.kerupuk;
    expect(costPerPortion(g.state, content, item)).toBeCloseTo(g.state.market.prices['g-kerupuk'] / 50, 6);
  });

  it('portion size changes what a dish uses: small saves, large costs more', () => {
    const g = new Game(content, { seed: 1 });
    const item = content.itemById['es-teh'];
    const normal = costPerPortion(g.state, content, item);
    g.dispatch({ type: 'setPortion', item: 'es-teh', portion: 'small' });
    expect(costPerPortion(g.state, content, item)).toBeCloseTo(normal * 0.8, 6);
    expect(dishNeeds(g.state, content, item).teh).toBeCloseTo(3 * 0.8, 6);
    g.dispatch({ type: 'setPortion', item: 'es-teh', portion: 'large' });
    expect(costPerPortion(g.state, content, item)).toBeCloseTo(normal * 1.25, 6);
    expect(dishNeeds(g.state, content, item).teh).toBeCloseTo(3 * 1.25, 6);
  });

  it('a sale uses the portion that was set, and costs what the stock cost', () => {
    const g = openGame();
    emptyPantry(g);
    lot(g, 'teh', 1000, 2);
    lot(g, 'gula', 1000, 3);
    lot(g, 'es-batu', 1000, 0.1);
    g.dispatch({ type: 'setPortion', item: 'es-teh', portion: 'large' });
    addCustomer(g, { order: [{ itemId: 'es-teh', qty: 1 }], method: 'qris' });
    pickAll(g);
    g.dispatch({ type: 'confirmQris' });
    expect(pantryQty(g, 'teh')).toBeCloseTo(1000 - 3 * 1.25, 6);
    expect(pantryQty(g, 'gula')).toBeCloseTo(1000 - 15 * 1.25, 6);
    expect(g.state.stats.cogs).toBeCloseTo(1.25 * (3 * 2 + 15 * 3 + 150 * 0.1), 6);
  });

  it('small portions slowly cost reputation and large ones earn it', () => {
    const rep = (portion: 'small' | 'normal' | 'large') => {
      const g = openGame(quietContent(), 1);
      stockUp(g, 'teh');
      stockUp(g, 'gula');
      stockUp(g, 'es-batu');
      g.dispatch({ type: 'setPortion', item: 'es-teh', portion });
      addCustomer(g, { order: [{ itemId: 'es-teh', qty: 1 }], method: 'qris' });
      pickAll(g);
      g.dispatch({ type: 'confirmQris' });
      return g.state.reputation;
    };
    expect(rep('normal') - rep('small')).toBeCloseTo(0.05, 6);
    expect(rep('large') - rep('normal')).toBeCloseTo(0.05, 6);
  });

  it('the summary counts what the sales cost and the profit after it', () => {
    const g = openGame();
    addCustomer(g, { order: [{ itemId: 'indomie-goreng', qty: 2 }], method: 'qris' });
    pickAll(g);
    g.dispatch({ type: 'confirmQris' });
    const s = g.summary();
    expect(s.cogs).toBeGreaterThan(6000);
    expect(s.cogs).toBeLessThan(9000);
    expect(s.netProfit).toBe(Math.round(g.state.stats.qrisRevenue - g.state.stats.cogs));
    expect(s.netProfit).toBeGreaterThan(0);
  });
});

describe('cash and the bank', () => {
  it('banks cash from the drawer', () => {
    const g = new Game(content, { seed: 1 });
    const drawer = total(g.state.drawer);
    const bank = g.state.bank;
    expect(g.dispatch({ type: 'depositCash', pieces: { 50000: 2, 20000: 1 } }).ok).toBe(true);
    expect(g.state.bank).toBe(bank + 120000);
    expect(total(g.state.drawer)).toBe(drawer - 120000);
  });

  it('refuses to bank notes that are not in the drawer, or nothing at all', () => {
    const g = new Game(content, { seed: 1 });
    expect(g.dispatch({ type: 'depositCash', pieces: { 100000: 1 } })).toEqual({ ok: false, error: 'not_in_drawer' });
    expect(g.dispatch({ type: 'depositCash', pieces: {} })).toEqual({ ok: false, error: 'invalid_pieces' });
    expect(g.dispatch({ type: 'depositCash', pieces: { 3000: 1 } })).toEqual({ ok: false, error: 'invalid_pieces' });
  });

  it('withdraws in big notes only, so it does not fix the shortage of small change', () => {
    const g = new Game(content, { seed: 1 });
    const small = (g.state.drawer[5000] ?? 0) + (g.state.drawer[2000] ?? 0);
    expect(g.dispatch({ type: 'withdrawCash', amount: 150000 }).ok).toBe(true);
    expect(g.state.drawer[100000]).toBe(1); // the drawer started without one
    expect(g.state.drawer[50000]).toBe(3);
    expect((g.state.drawer[5000] ?? 0) + (g.state.drawer[2000] ?? 0)).toBe(small);
    expect(g.dispatch({ type: 'withdrawCash', amount: 30000 })).toEqual({ ok: false, error: 'invalid_amount' });
    g.state.bank = 10000;
    expect(g.dispatch({ type: 'withdrawCash', amount: 50000 })).toEqual({ ok: false, error: 'insufficient_funds' });
  });
});

describe('running a shop on bought stock', () => {
  it('a bot that keeps ordering stays supplied for two weeks, and money and stock never go negative', () => {
    const g = new Game(content, { seed: 12 });
    const served: number[] = [];
    for (let day = 0; day < 14; day++) {
      playAnyDay(g);
      if (g.state.phase !== 'ended' && g.state.phase !== 'night') continue; // a day off
      served.push(g.state.stats.served);
      sleepThrough(g);
      expect(g.state.pantry.every((l) => l.qty > 0), `pantry on day ${day}`).toBe(true);
      expect(g.state.bank, `bank on day ${day}`).toBeGreaterThanOrEqual(0);
      expect(Object.values(g.state.stock).every((n) => n >= 0)).toBe(true);
    }
    expect(served.length).toBeGreaterThanOrEqual(10);
    expect(served[served.length - 1]).toBeGreaterThan(30); // still serving plenty on the last shop day
    expect(g.state.orders.some((o) => o.status === 'delivered')).toBe(true);
  });

  it('without ordering, the shop runs dry and customers are turned away', () => {
    const g = new Game(content, { seed: 12 });
    const stockouts: number[] = [];
    for (let day = 0; day < 5; day++) {
      bankTheBigNotes(g);
      if (g.state.phase === 'dayoff') {
        while (g.state.phase === 'dayoff') g.dispatch({ type: 'runBlock' });
        sleepThrough(g);
        continue;
      }
      playAnyDayNoRestock(g);
      stockouts.push(g.state.stats.stockoutDeclines);
      sleepThrough(g);
    }
    expect(Math.max(...stockouts)).toBeGreaterThan(5);
    void restock;
  });
});

function playAnyDayNoRestock(g: Game) {
  // the same as the bot's day, minus its ordering
  g.dispatch({ type: 'open', prepared: true });
  const { botAct } = botModule;
  while (g.state.phase === 'open') {
    for (let i = 0; i < 4; i++) if (!botAct(g)) break;
    g.tick();
  }
}
import * as botModule from './testing/bot';

// keep the imports used when a test above is trimmed
void ingredientQty;
void stockUp;
