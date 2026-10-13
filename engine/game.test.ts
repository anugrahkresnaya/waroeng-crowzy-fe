import { describe, expect, it } from 'vitest';
import { content } from './content';
import { Game } from './game';
import { ingredientQty } from './market';
import { total } from './money';
import { replay } from './replay';
import { playDay } from './testing/bot';
import { quietContent } from './testing/fixtures';

const fresh = (seed: number) => new Game(content, { seed });
const json = (g: Game) => JSON.stringify(g.state);

describe('a full day', () => {
  it('plays from open to close with sales, and a sensible summary', () => {
    const game = playDay(fresh(1));
    const s = game.summary();
    expect(game.state.phase).toBe('ended');
    expect(game.state.minute).toBe(content.balance.closeMinute);
    expect(s.served).toBeGreaterThan(20);
    expect(s.grossSales).toBe(s.cashRevenue + s.qrisRevenue + s.qrisFees + s.kasbonCredit);
    expect(s.moods.happy + s.moods.neutral + s.moods.annoyed).toBe(s.served);
    expect(game.state.line).toHaveLength(0);
    expect(Object.values(game.state.stock).every((n) => n >= 0)).toBe(true);
    expect(Object.values(game.state.drawer).every((n) => n >= 0)).toBe(true);
  });

  it('is deterministic: the same seed gives an identical day', () => {
    expect(json(playDay(fresh(42)))).toBe(json(playDay(fresh(42))));
  });

  it('different seeds give different days', () => {
    expect(json(playDay(fresh(1)))).not.toBe(json(playDay(fresh(2))));
  });

  it('can be rebuilt from the seed and the command log', () => {
    const original = playDay(fresh(7));
    const rebuilt = replay(content, 7, original.log);
    expect(json(rebuilt)).toBe(json(original));
  });

  it('keeps cash, bank, goods and ingredients consistent with the sales it recorded', () => {
    // With noticing switched off no payouts happen, so the drawer must balance to the rupiah.
    const blind = { ...content, balance: { ...content.balance, noticeShortChange: 0 } };
    const game = new Game(blind, { seed: 3 });
    const before = {
      pantry: Object.fromEntries(content.ingredients.map((i) => [i.id, ingredientQty(game.state, i.id)])),
      stock: { ...game.state.stock },
      bank: game.state.bank,
    };
    playDay(game);
    const s = game.state.stats;
    const startDrawer = Object.entries(content.balance.startDrawer).reduce((sum, [d, n]) => sum + Number(d) * n, 0);
    expect(total(game.state.drawer)).toBe(startDrawer + s.cashRevenue + s.shortChangeGained - s.overChange);
    expect(game.state.bank).toBe(before.bank + s.qrisRevenue);

    // Goods on the shelf went down by exactly what was sold.
    for (const item of content.items.filter((i) => i.kind === 'good')) {
      expect(game.state.stock[item.id], item.id).toBe(before.stock[item.id] - (s.itemsSold[item.id] ?? 0));
    }
    // Ingredients used equal what the dishes sold needed (every portion was a normal one).
    for (const ing of content.ingredients) {
      let used = 0;
      for (const item of content.items.filter((i) => i.kind === 'dish')) used += (item.recipe?.[ing.id] ?? 0) * (s.itemsSold[item.id] ?? 0);
      expect(before.pantry[ing.id] - ingredientQty(game.state, ing.id), ing.id).toBeCloseTo(used, 5);
    }
    expect(s.cogs).toBeGreaterThan(0);
  });

  it('a slower player serves fewer customers and loses more to patience', () => {
    const fast = playDay(fresh(5), { actionsPerTick: 6 }).summary();
    const slow = playDay(fresh(5), { actionsPerTick: 0.25 }).summary();
    expect(slow.served).toBeLessThan(fast.served);
    expect(slow.walkaways).toBeGreaterThan(fast.walkaways);
  });

  it('can fast-forward only in quiet hours with an empty line', () => {
    const game = new Game(quietContent(), { seed: 1 });
    game.dispatch({ type: 'open', prepared: true });
    expect(game.canFastForward()).toBe(false);
    game.state.minute = 15 * 60;
    expect(game.canFastForward()).toBe(true);
    game.state.minute = 12 * 60;
    expect(game.canFastForward()).toBe(false);
  });
});

describe('saving', () => {
  it('a JSON snapshot resumes to the exact same day', () => {
    const a = fresh(11);
    a.dispatch({ type: 'open', prepared: true });
    for (let i = 0; i < 200; i++) a.tick();
    const saved = JSON.parse(JSON.stringify(a.snapshot()));
    const b = Game.fromSnapshot(content, saved);
    for (let i = 0; i < 300; i++) {
      a.tick();
      b.tick();
    }
    expect(json(b)).toBe(json(a));
  });

  it('only logs accepted commands', () => {
    const game = fresh(1);
    game.dispatch({ type: 'pick', itemId: 'es-teh' });
    game.dispatch({ type: 'open', prepared: true });
    expect(game.log.map((l) => l.command.type)).toEqual(['open']);
  });
});
