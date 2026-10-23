import { describe, expect, it } from 'vitest';
import { content } from './content';
import { Game } from './game';
import { arrivalMul, fridgeFailed, outageEnd, plnOff, powerOff, tickPower } from './outage';
import { replay } from './replay';
import { addCustomer, kitchenContent, passDay, stockUp } from './testing/fixtures';
import type { Outage } from './types';

const o = content.balance.outage;
const cut = (patch: Partial<Outage> = {}): Outage => ({ day: 0, from: 480, hours: 5, known: false, ice: false, ...patch });

/** An open shop where a cut is scheduled for today. */
function openWith(outage: Outage | null) {
  const g = new Game(kitchenContent(), { seed: 1 });
  g.state.outage = outage;
  g.dispatch({ type: 'open', prepared: true });
  return g;
}
const at = (g: Game, minute: number) => {
  g.state.minute = minute;
};

describe('when the power is out', () => {
  it('is out from the start minute until the end, and only on its day', () => {
    const g = openWith(cut({ from: 600, hours: 2 }));
    at(g, 599);
    expect(powerOff(g.state)).toBe(false);
    at(g, 600);
    expect(powerOff(g.state)).toBe(true);
    at(g, 719);
    expect(powerOff(g.state)).toBe(true);
    at(g, outageEnd(g.state.outage!));
    expect(powerOff(g.state)).toBe(false);
    g.state.outage = cut({ day: 1, from: 600, hours: 2 });
    at(g, 650);
    expect(powerOff(g.state)).toBe(false);
  });

  it('never runs past midnight', () => {
    expect(outageEnd(cut({ from: 1080, hours: 8 }))).toBe(1440);
  });

  it('tells the player when the lights go out and come back', () => {
    const g = openWith(cut({ from: 440, hours: 1 }));
    const events: string[] = [];
    for (let i = 0; i < 80; i++) {
      events.push(...g.tick().map((e) => e.type));
    }
    expect(events.filter((e) => e === 'power_out')).toHaveLength(1);
    expect(events.filter((e) => e === 'power_back')).toHaveLength(1);
    expect(events.indexOf('power_out')).toBeLessThan(events.indexOf('power_back'));
  });

  it('keeps cold drinks off the menu until ice is bought', () => {
    const g = openWith(cut({ from: 420, hours: 5 }));
    at(g, 500);
    const before = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'cookBatch', item: 'es-teh', batches: 1 })).toEqual({ ok: false, error: 'no_ice' });
    expect(JSON.stringify(g.state)).toBe(before);
    expect(g.dispatch({ type: 'buyIce' }).ok).toBe(true);
    for (let i = 0; i < o.errandMinutes; i++) g.tick();
    expect(g.dispatch({ type: 'cookBatch', item: 'es-teh', batches: 1 }).ok).toBe(true);
  });

  it('keeps other dishes cooking', () => {
    const g = openWith(cut({ from: 420, hours: 5 }));
    addCustomer(g, { order: [{ itemId: 'indomie-goreng', qty: 1 }], method: 'qris', patience: 200 });
    expect(g.dispatch({ type: 'startCook', item: 'indomie-goreng', auto: false }).ok).toBe(true);
  });

  it('fewer customers come in the dark, a few more with a lantern, and no change by day or with power', () => {
    const g = openWith(cut({ from: 420, hours: 14 }));
    at(g, o.darkFrom - 1);
    expect(arrivalMul(g.state, g.content)).toBe(1);
    at(g, o.darkFrom + 10);
    expect(arrivalMul(g.state, g.content)).toBe(o.lantern.darkMul);
    g.state.lantern = true;
    expect(arrivalMul(g.state, g.content)).toBe(o.lantern.lanternMul);
    g.state.outage = null;
    expect(arrivalMul(g.state, g.content)).toBe(1);
  });
});

describe('ice and a lantern', () => {
  it('ice only helps on the day of a cut, once, and costs money and time', () => {
    const g = openWith(null);
    expect(g.dispatch({ type: 'buyIce' })).toEqual({ ok: false, error: 'no_outage' });
    g.state.outage = cut();
    const bank = g.state.bank;
    expect(g.dispatch({ type: 'buyIce' }).ok).toBe(true);
    expect(g.state.bank).toBe(bank - o.ice.price);
    expect(g.state.outage!.ice).toBe(true);
    expect(g.state.busyUntil).toBe(g.state.tick + o.errandMinutes);
    for (let i = 0; i < o.errandMinutes; i++) g.tick();
    expect(g.dispatch({ type: 'buyIce' })).toEqual({ ok: false, error: 'already_owned' });
  });

  it('a lantern is bought once and refused without money, leaving state alone', () => {
    const g = openWith(null);
    g.state.bank = o.lantern.price - 1;
    const before = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'buyLantern' })).toEqual({ ok: false, error: 'insufficient_funds' });
    expect(JSON.stringify(g.state)).toBe(before);
    g.state.bank = o.lantern.price;
    expect(g.dispatch({ type: 'buyLantern' }).ok).toBe(true);
    expect(g.state.lantern).toBe(true);
    for (let i = 0; i < o.errandMinutes; i++) g.tick();
    expect(g.dispatch({ type: 'buyLantern' })).toEqual({ ok: false, error: 'already_owned' });
  });
});

describe('the fridge', () => {
  const longCut = (extra: Partial<Outage> = {}) => cut({ hours: o.fridgeHoldHours + 1, ...extra });

  it('holds through a short cut and fails in a long one, unless ice was bought', () => {
    const g = openWith(null);
    expect(fridgeFailed(g.state, g.content, 0)).toBe(false);
    g.state.outage = cut({ hours: o.fridgeHoldHours });
    expect(fridgeFailed(g.state, g.content, 0)).toBe(false);
    g.state.outage = longCut();
    expect(fridgeFailed(g.state, g.content, 0)).toBe(true);
    g.state.outage = longCut({ ice: true });
    expect(fridgeFailed(g.state, g.content, 0)).toBe(false);
    g.state.outage = longCut({ day: 3 });
    expect(fridgeFailed(g.state, g.content, 0)).toBe(false);
  });

  /** Sawi keeps longer in the fridge than on the shelf, so a failed fridge costs the player their greens. */
  function sleepWithGreens(outage: Outage | null) {
    const g = new Game(kitchenContent(), { seed: 1 });
    g.state.pantry = [];
    stockUp(g, 'sawi', 1000, 5);
    g.state.pantry[0].bought = g.state.day - 2;
    g.state.outage = outage;
    const ing = content.ingredientById.sawi;
    expect(ing.life.fridge).toBeGreaterThan(ing.life.room ?? 0);
    g.state.pantry[0].stored = 'fridge';
    passDay(g);
    return g;
  }

  it('what the fridge kept spoils at room-temperature speed after a long cut', () => {
    const fine = sleepWithGreens(null);
    const ruined = sleepWithGreens(longCut());
    expect(fine.state.lastSpoiled).toEqual([]);
    expect(ruined.state.lastSpoiled.map((s) => s.ingredient)).toEqual(['sawi']);
  });
});

describe('the roll', () => {
  const sure = (patch: Partial<typeof o>) => kitchenContent(content, { outage: { ...o, fromDay: 0, chancePerDay: 1, ...patch } });

  it('with notice, tomorrow is announced a day ahead; without, it hits the same day', () => {
    const warned = new Game(sure({ noticeChance: 1 }), { seed: 3 });
    const events = passDay(warned);
    expect(events.some((e) => e.type === 'outage_notice')).toBe(true);
    expect(warned.state.outage).toMatchObject({ day: warned.state.day + 1, known: true });

    const sudden = new Game(sure({ noticeChance: 0 }), { seed: 3 });
    expect(passDay(sudden).some((e) => e.type === 'outage_notice')).toBe(false);
    expect(sudden.state.outage).toMatchObject({ day: sudden.state.day, known: false });
  });

  it('a cut that has passed is cleared, and the announced one stays until its day', () => {
    const g = new Game(sure({ noticeChance: 1 }), { seed: 3 });
    passDay(g);
    const planned = { ...g.state.outage! };
    passDay(g); // the day the cut is due: nothing new is rolled over it
    expect(planned.day).toBe(g.state.day);
    expect(g.state.outage).toEqual(planned);
    g.state.outage!.day = g.state.day - 1;
    passDay(g);
    expect(g.state.outage!.day).toBeGreaterThanOrEqual(g.state.day);
  });

  it('does nothing before the first day it can happen', () => {
    const g = new Game(sure({ fromDay: 10 }), { seed: 3 });
    passDay(g);
    expect(g.state.outage).toBeNull();
  });

  it('replays exactly with cuts in the run', () => {
    const c = sure({ noticeChance: 0.5 });
    const g = new Game(c, { seed: 5 });
    for (let i = 0; i < 4; i++) passDay(g);
    g.dispatch({ type: 'buyLantern' });
    const again = replay(c, 5, g.log);
    expect(again.state.outage).toEqual(g.state.outage);
    expect(again.state.lantern).toBe(true);
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(g.state));
  });
});

describe('generator and selling off cold stock', () => {
  const cutToday = (g: Game, hours = 5) => {
    g.state.outage = { day: g.state.day, from: 480, hours, known: true, ice: false };
  };
  const open = () => {
    const g = new Game(kitchenContent(), { seed: 1 });
    g.state.token = 1e9;
    g.state.bank = 5e6;
    return g;
  };

  it('keeps the shop powered through the cut for as many hours as it can fuel', () => {
    const g = open();
    expect(g.dispatch({ type: 'buyGenerator' }).ok).toBe(true);
    cutToday(g, 5);
    g.state.bank = content.balance.outage.generator.fuelPerHour * 3 + 5;
    g.state.phase = 'open';
    g.state.minute = 480;
    tickPower({ state: g.state, content: g.content, emit: () => {} });
    expect(g.state.outage?.genHours).toBe(3);
    expect(powerOff(g.state)).toBe(false);
    expect(plnOff(g.state)).toBe(true);
    g.state.minute = 480 + 3 * 60;
    expect(powerOff(g.state)).toBe(true);
  });

  it('a cut that the generator covers spares the fridge', () => {
    const g = open();
    g.state.generator = true;
    cutToday(g, 8);
    g.state.outage!.genHours = 8;
    expect(fridgeFailed(g.state, g.content, g.state.day)).toBe(false);
  });

  it('sells the cold stock for cash, and only in a cut', () => {
    const g = open();
    const ing = content.ingredients.find((i) => i.life.fridge !== null)!;
    g.state.pantry = [
      { ingredient: ing.id, qty: ing.unitSize * 4, bought: 0, unitCost: 1000, stored: 'fridge' },
      { ingredient: ing.id, qty: ing.unitSize, bought: 0, unitCost: 1000, stored: 'room' },
    ];
    expect(g.dispatch({ type: 'sellOffStock' })).toEqual({ ok: false, error: 'no_outage' });
    cutToday(g);
    const before = Object.entries(g.state.drawer).reduce((s, [d, n]) => s + Number(d) * n, 0);
    const r = g.dispatch({ type: 'sellOffStock' });
    expect(r.ok).toBe(true);
    const after = Object.entries(g.state.drawer).reduce((s, [d, n]) => s + Number(d) * n, 0);
    expect(after).toBeGreaterThan(before);
    expect(g.state.pantry.map((l) => l.stored)).toEqual(['room']);
    expect(g.dispatch({ type: 'sellOffStock' })).toEqual({ ok: false, error: 'nothing_to_sell' });
  });
});
