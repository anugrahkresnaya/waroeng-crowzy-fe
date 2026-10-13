import { describe, expect, it } from 'vitest';
import { content, parseContent } from './content';
import { Game } from './game';
import { replay } from './replay';
import { SAVE_FORMAT, createSave, parseSave, reconcile, restoreGame } from './save';
import { playAnyDay, sleepThrough } from './testing/bot';
import { rawContent } from './testing/raw-content';

const json = (g: Game) => JSON.stringify(g.state);
const viaStorage = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

function playDays(seed: number, days: number) {
  const g = new Game(content, { seed });
  for (let i = 0; i < days; i++) {
    playAnyDay(g);
    sleepThrough(g);
  }
  return g;
}

describe('saving and loading', () => {
  it('a saved game loads back to exactly the same state, and its log replays to it', () => {
    const g = playDays(21, 4);
    const parsed = parseSave(viaStorage(createSave(g, 1234)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const loaded = restoreGame(content, parsed.save);
    expect(json(loaded)).toBe(json(g));
    expect(loaded.log).toHaveLength(g.log.length);
    expect(json(replay(content, parsed.save.seed, parsed.save.log as never, parsed.save.startDay))).toBe(json(g));
  });

  it('resuming in the middle of a shift carries on exactly like an uninterrupted run', () => {
    const play = (g: Game, minutes: number) => {
      for (let i = 0; i < minutes; i++) g.tick();
    };
    const a = new Game(content, { seed: 8 });
    a.dispatch({ type: 'open', prepared: true });
    play(a, 300);
    const loaded = restoreGame(content, parseSaveOk(viaStorage(createSave(a, 1))));
    play(a, 400);
    play(loaded, 400);
    expect(json(loaded)).toBe(json(a));
    expect(a.state.line.length + a.state.stats.served).toBeGreaterThan(0);
  });

  it('keeps the start day, so a game that began on a day off still replays', () => {
    const g = new Game(content, { seed: 3, day: 5 });
    expect(g.state.phase).toBe('dayoff');
    while (g.state.phase === 'dayoff') g.dispatch({ type: 'runBlock' });
    const save = parseSaveOk(viaStorage(createSave(g, 1)));
    expect(save.startDay).toBe(5);
    expect(json(replay(content, save.seed, save.log as never, save.startDay))).toBe(json(g));
  });
});

function parseSaveOk(raw: unknown) {
  const r = parseSave(raw);
  if (!r.ok) throw new Error(`expected a valid save, got ${r.reason}`);
  return r.save;
}

describe('reading what storage returns', () => {
  const good = () => viaStorage(createSave(playDays(2, 1), 1)) as Record<string, unknown>;

  it('refuses things that are not saves, without throwing', () => {
    for (const bad of [null, undefined, 42, 'text', [], {}, { format: 'one' }, { format: 0 }, { format: 1.5 }]) {
      expect(parseSave(bad)).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('says when a save comes from a newer version of the game', () => {
    expect(parseSave({ ...good(), format: SAVE_FORMAT + 1 })).toEqual({ ok: false, reason: 'newer' });
  });

  it('carries a format 2 save (before the kitchen) forward with an empty display', () => {
    const save = good() as unknown as { state: { display?: unknown; stats: Record<string, unknown> } };
    delete save.state.display;
    for (const k of ['waste', 'obralRevenue', 'givenRep']) delete save.state.stats[k];
    const parsed = parseSave({ ...save, format: 2 });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.save.format).toBe(SAVE_FORMAT);
      expect(parsed.save.state.display).toEqual({});
      expect(parsed.save.state.stats.waste).toBe(0);
    }
  });

  it('carries a format 3 save (before the stove) forward with nothing cooking', () => {
    const save = good() as unknown as { state: { burners?: unknown; skill?: unknown; stats: Record<string, unknown>; line: Array<Record<string, unknown>> } };
    delete save.state.burners;
    delete save.state.skill;
    delete save.state.stats.cooking;
    for (const c of save.state.line) delete c.cooked;
    const parsed = parseSave({ ...save, format: 3 });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.save.state.burners).toEqual([null, null]);
      expect(parsed.save.state.skill).toEqual({});
      expect(parsed.save.state.stats.cooking.pas).toBe(0);
    }
  });

  it('says a format 1 save (before the market) is outdated', () => {
    expect(parseSave({ ...good(), format: 1 })).toEqual({ ok: false, reason: 'outdated' });
  });

  it('rejects a save whose state has been damaged', () => {
    type Loose = { phase: string; workDays: boolean[]; stock: Record<string, number>; drawer: Record<string, number>; stats?: unknown; day: unknown };
    const damaged = (mutate: (s: Loose) => void) => {
      const save = good();
      mutate(save.state as Loose);
      return parseSave(save);
    };
    expect(damaged((s) => { s.phase = 'weekend'; })).toEqual({ ok: false, reason: 'invalid' });
    expect(damaged((s) => { s.workDays = [true, true]; })).toEqual({ ok: false, reason: 'invalid' });
    expect(damaged((s) => { s.stock['indomie-goreng'] = -3; })).toEqual({ ok: false, reason: 'invalid' });
    expect(damaged((s) => { s.drawer = { 5000: 1.5 }; })).toEqual({ ok: false, reason: 'invalid' });
    expect(damaged((s) => { delete s.stats; })).toEqual({ ok: false, reason: 'invalid' });
    expect(damaged((s) => { s.day = 'two'; })).toEqual({ ok: false, reason: 'invalid' });
    expect(damaged(() => undefined).ok).toBe(true);
  });

  it('rejects a log entry without a command type', () => {
    const save = good();
    (save.log as unknown[]).push({ tick: 1, command: {} });
    expect(parseSave(save)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('content that changed since the save', () => {
  type Raw = ReturnType<typeof rawContent>;
  const raw = rawContent;
  const without = (r: Raw, id: string) => {
    r.items = r.items.filter((i) => i.id !== id);
    r.customers = r.customers.map((c) => ({ ...c, items: Object.fromEntries(Object.entries(c.items).filter(([k]) => k !== id)) }));
  };

  it('drops goods and dishes that no longer exist, and starts new goods at their starting stock', () => {
    const g = new Game(content, { seed: 1 });
    g.dispatch({ type: 'open', prepared: true });
    g.state.stats.itemsSold.permen = 4;
    const r = raw();
    without(r, 'permen');
    without(r, 'gorengan');
    delete r.balance.start.goods.permen;
    r.items.push({ ...r.items.find((i) => i.id === 'keripik')!, id: 'baru', art: 'roti', name: { id: 'Baru', en: 'New' }, buyPrice: 500, pack: 10 });
    r.balance.start.goods.baru = 7;
    const fixed = reconcile(g.snapshot(), parseContent(r));
    expect('permen' in fixed.stock).toBe(false);
    expect('permen' in fixed.goodsCost).toBe(false);
    expect('permen' in fixed.stats.itemsSold).toBe(false);
    expect(fixed.stock.baru).toBe(7);
    expect('gorengan' in fixed.menu).toBe(false);
    expect(fixed.menu['es-teh']).toEqual(g.state.menu['es-teh']);
  });

  it('drops pantry lots and orders for things that are gone, and keeps the player\'s menu choices', () => {
    const g = new Game(content, { seed: 1 });
    g.dispatch({ type: 'setDishPrice', item: 'es-teh', price: 3500 });
    g.dispatch({ type: 'setPortion', item: 'es-teh', portion: 'large' });
    g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines: [{ key: 'beras', qty: 2 }, { key: 'sawi', qty: 1 }], express: false });
    const r = raw();
    r.ingredients = r.ingredients.filter((i) => i.id !== 'sawi');
    delete r.balance.start.pantry.sawi;
    for (const item of r.items) if (item.recipe) delete item.recipe.sawi;
    r.market.seasons.forEach((s) => s.effects.forEach((e: { match: string[] }) => (e.match = e.match.filter((m) => m !== 'sawi'))));
    const fixed = reconcile(g.snapshot(), parseContent(r));
    expect(fixed.pantry.some((l) => l.ingredient === 'sawi')).toBe(false);
    expect(fixed.orders[0].lines.map((l) => l.key)).toEqual(['beras']);
    expect(fixed.menu['es-teh']).toEqual({ price: 3500, portion: 'large' });
    expect('sawi' in fixed.market.prices).toBe(false);
  });

  it('drops queued customers that order something that is gone, or are of a removed type', () => {
    const g = new Game(content, { seed: 1 });
    g.dispatch({ type: 'open', prepared: true });
    const mk = (type: string, itemId: string) => ({
      id: g.state.nextCustomerId++, type, age: 30, order: [{ itemId, qty: 1 }], tray: {}, patience: 10, maxPatience: 10,
      arrivedAt: 0, stage: 'ordering' as const, method: 'qris' as const, bill: 1000, tender: {}, ktpChecked: false, cooked: {},
    });
    g.state.line = [mk('langganan', 'es-teh'), mk('langganan', 'permen'), mk('hantu', 'es-teh')];
    const r = raw();
    without(r, 'permen');
    delete r.balance.start.goods.permen;
    const fixed = reconcile(g.snapshot(), parseContent(r));
    expect(fixed.line.map((c) => c.order[0].itemId)).toEqual(['es-teh']);
  });

  it('replaces a day-off plan that is no longer valid and pads the hourly sales', () => {
    const g = new Game(content, { seed: 1 });
    g.state.offPlan.sore = ['narik-ojol', 'cek-chat'];
    g.state.offPlan.pagi = ['aktivitas-lama'];
    g.state.stats.salesByHour = [100, 200];
    const fixed = reconcile(g.snapshot(), content);
    expect(fixed.offPlan.sore).toEqual(content.balance.defaultOffPlan.sore);
    expect(fixed.offPlan.pagi).toEqual(content.balance.defaultOffPlan.pagi);
    expect(fixed.stats.salesByHour).toHaveLength(15);
    expect(fixed.stats.salesByHour.slice(0, 3)).toEqual([100, 200, 0]);
  });

  it('leaves a current save untouched', () => {
    const g = playDays(4, 2);
    expect(JSON.stringify(reconcile(g.snapshot(), content))).toBe(JSON.stringify(g.state));
  });
});
