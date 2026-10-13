import { describe, expect, it } from 'vitest';
import { content } from './content';
import { Game } from './game';
import type { Command } from './types';

/** A tiny generator of its own, so the fuzzing never touches the game's random numbers. */
function lcg(seed: number) {
  let s = seed >>> 0;
  const next = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  return {
    int: (n: number) => Math.floor(next() * n),
    pick: <T,>(a: readonly T[]): T => a[Math.floor(next() * a.length)],
    chance: (p: number) => next() < p,
  };
}

const ITEMS = content.items.map((i) => i.id);
const KEYS = content.products.map((p) => p.key);
const SUPPLIERS = [...content.suppliers.map((s) => s.id), 'nobody'];
const ACTIVITIES = [...content.activities.dayOff.map((a) => a.id), ...content.activities.freeTime.map((a) => a.id), 'tidak-ada'];
const BLOCKS = [...content.balance.offBlocks.map((b) => b.id), 'subuh'];

function randomCommand(r: ReturnType<typeof lcg>): Command {
  const qty = () => r.pick([-1, 0, 1, 1, 2, 3, 7, 1.5]);
  const lines = () => Array.from({ length: r.int(4) }, () => ({ key: r.chance(0.05) ? 'durian' : r.pick(KEYS), qty: qty() }));
  const pieces = () => Object.fromEntries([[r.pick([100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 3000]), r.pick([0, 1, 2, 5])]]);
  const make: Array<() => Command> = [
    () => ({ type: 'open', prepared: r.chance(0.5) }),
    () => ({ type: 'restockShelves' }),
    () => ({ type: 'startCook', item: r.pick(ITEMS), auto: r.chance(0.3) }),
    () => ({ type: 'plate', burner: r.pick([0, 1, 2, -1]) }),
    () => ({ type: 'cookBatch', item: r.pick(ITEMS), batches: r.pick([0, 1, 1, 2, 3, 25, 1.5, -1]) }),
    () => ({ type: 'handleLeftover', item: r.pick(ITEMS), choice: r.pick(['obral', 'eat', 'give', 'trash', 'sell'] as const) as never }),
    () => ({ type: 'closeWarung' }),
    () => ({ type: 'goToNight' }),
    () => ({ type: 'nextDay' }),
    () => ({ type: 'runBlock' }),
    () => ({ type: 'confirmPlan' }),
    () => ({ type: 'pick', itemId: r.pick(ITEMS) }),
    () => ({ type: 'unpick', itemId: r.pick(ITEMS) }),
    () => ({ type: 'declineItem', itemId: r.pick(ITEMS) }),
    () => ({ type: 'checkKtp' }),
    () => ({ type: 'confirmOrder' }),
    () => ({ type: 'confirmQris' }),
    () => ({ type: 'grantKasbon' }),
    () => ({ type: 'refuseKasbon' }),
    () => ({ type: 'giveChange', pieces: pieces() }),
    () => ({ type: 'exchangeCash', amount: r.pick([0, 20000, 50000, 100000, 150000, 75000]) }),
    () => ({ type: 'depositCash', pieces: pieces() }),
    () => ({ type: 'withdrawCash', amount: r.pick([0, 30000, 50000, 100000, 5000000]) }),
    () => ({ type: 'setPlan', day: r.int(9) - 1, work: r.chance(0.5) }),
    () => ({ type: 'setBlock', block: r.pick(BLOCKS), activities: Array.from({ length: r.int(4) }, () => r.pick(ACTIVITIES)) }),
    () => ({ type: 'spendFreeTime', activities: Array.from({ length: r.int(6) }, () => r.pick(ACTIVITIES)) }),
    () => ({ type: 'decideTomorrow', open: r.chance(0.5) }),
    () => ({ type: 'placeOrder', supplier: r.pick(SUPPLIERS), lines: lines(), express: r.chance(0.3) }),
    () => ({ type: 'pasarTrip', lines: lines() }),
    () => ({ type: 'setDishPrice', item: r.pick(ITEMS), price: r.pick([0, 300, 500, 3000, 3050, 4500, 250000]) }),
    () => ({ type: 'setPortion', item: r.pick(ITEMS), portion: r.pick(['small', 'normal', 'large', 'huge'] as const) as never }),
  ];
  return r.pick(make)();
}

describe('rules that must always hold', () => {
  it('a refused command changes nothing at all, whatever the phase', () => {
    let refused = 0;
    let accepted = 0;
    const phasesSeen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = new Game(content, { seed });
      const r = lcg(seed * 7919);
      for (let i = 0; i < 1500; i++) {
        phasesSeen.add(g.state.phase);
        if (g.state.phase === 'open' && r.chance(0.7)) {
          for (let k = r.int(25) + 1; k > 0 && g.state.phase === 'open'; k--) g.tick();
          continue;
        }
        const before = JSON.stringify(g.state);
        const logLength = g.log.length;
        const cmd = randomCommand(r);
        const result = g.dispatch(cmd);
        if (!result.ok) {
          refused++;
          expect(JSON.stringify(g.state), `${seed}/${i}: ${JSON.stringify(cmd)} was refused with ${result.error}`).toBe(before);
          expect(g.log.length).toBe(logLength);
        } else accepted++;
      }
    }
    expect(refused).toBeGreaterThan(2000);
    expect(accepted).toBeGreaterThan(500);
    expect([...phasesSeen].sort()).toEqual(['bed', 'dayoff', 'ended', 'idle', 'night', 'open']); // it really did wander through the whole week
  });

  it('whatever happens, the numbers stay sane', () => {
    for (const seed of [11, 12, 13]) {
      const g = new Game(content, { seed });
      const r = lcg(seed * 104729);
      for (let i = 0; i < 2500; i++) {
        if (g.state.phase === 'open' && r.chance(0.7)) for (let k = r.int(40) + 1; k > 0 && g.state.phase === 'open'; k--) g.tick();
        else g.dispatch(randomCommand(r));
        const s = g.state;
        const ctx = `seed ${seed} step ${i}`;
        expect(s.bank, ctx).toBeGreaterThanOrEqual(0);
        expect(s.mood, ctx).toBeGreaterThanOrEqual(0);
        expect(s.mood, ctx).toBeLessThanOrEqual(100);
        expect(s.hunger, ctx).toBeGreaterThanOrEqual(0);
        expect(s.hunger, ctx).toBeLessThanOrEqual(100);
        expect(s.reputation, ctx).toBeGreaterThanOrEqual(0);
        expect(s.reputation, ctx).toBeLessThanOrEqual(100);
        expect(Object.values(s.drawer).every((n) => n >= 0), `${ctx}: drawer`).toBe(true);
        expect(Object.values(s.stock).every((n) => n >= 0 && Number.isInteger(n)), `${ctx}: goods`).toBe(true);
        expect(s.pantry.every((l) => l.qty > 0 && Number.isFinite(l.unitCost)), `${ctx}: pantry`).toBe(true);
        expect(Object.values(s.display).every((bs) => bs.length > 0 && bs.every((b) => b.qty > 0 && Number.isFinite(b.unitCost))), `${ctx}: display`).toBe(true);
        expect(s.burners.length, ctx).toBe(content.balance.burners);
        expect(s.burners.every((b) => b === null || s.line.some((c) => c.id === b.customerId)), `${ctx}: burners`).toBe(true);
        expect(s.stats.waste, ctx).toBeGreaterThanOrEqual(0);
        expect(s.line.length, ctx).toBeLessThanOrEqual(content.balance.lineCapacity);
        expect(Object.values(s.market.prices).every((p) => p > 0 && Number.isFinite(p)), `${ctx}: prices`).toBe(true);
        expect(s.workDays.filter((w) => !w).length, ctx).toBeLessThanOrEqual(content.balance.maxDaysOff);
        expect(s.minute, ctx).toBeGreaterThanOrEqual(0);
        expect(s.minute, ctx).toBeLessThanOrEqual(1440);
      }
    }
  });
});
