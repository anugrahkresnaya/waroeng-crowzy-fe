import { describe, expect, it } from 'vitest';
import activities from './content/activities.json';
import balance from './content/balance.json';
import customers from './content/customers.json';
import items from './content/items.json';
import { content, parseContent } from './content';
import { Game } from './game';
import { replay } from './replay';
import { SAVE_FORMAT, createSave, parseSave, reconcile, restoreGame } from './save';
import { playAnyDay, sleepThrough } from './testing/bot';

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
  type Raw = {
    items: Array<Record<string, unknown> & { id: string }>;
    customers: Array<Record<string, unknown> & { items: Record<string, number> }>;
    balance: unknown;
    activities: unknown;
  };
  const raw = () => structuredClone({ items, customers, balance, activities }) as unknown as Raw;
  const without = (r: Raw, id: string) => {
    r.items = r.items.filter((i) => i.id !== id);
    r.customers = r.customers.map((c) => ({ ...c, items: Object.fromEntries(Object.entries(c.items).filter(([k]) => k !== id)) }));
  };

  it('drops items that no longer exist and starts new ones fully stocked', () => {
    const g = new Game(content, { seed: 1 });
    g.dispatch({ type: 'open', prepared: true });
    g.state.stats.itemsSold.telur = 4;
    const r = raw();
    without(r, 'telur');
    r.items.push({ ...r.items[0], id: 'baru', art: 'roti', name: { id: 'Baru', en: 'New' }, startStock: 7 });
    const changed = parseContent(r);
    const fixed = reconcile(g.snapshot(), changed);
    expect('telur' in fixed.stock).toBe(false);
    expect(fixed.stock.baru).toBe(7);
    expect('telur' in fixed.stats.itemsSold).toBe(false);
  });

  it('drops queued customers that order something that is gone, or are of a removed type', () => {
    const g = new Game(content, { seed: 1 });
    g.dispatch({ type: 'open', prepared: true });
    const mk = (type: string, itemId: string) => ({
      id: g.state.nextCustomerId++, type, age: 30, order: [{ itemId, qty: 1 }], tray: {}, patience: 10, maxPatience: 10,
      arrivedAt: 0, stage: 'ordering' as const, method: 'qris' as const, bill: 1000, tender: {}, ktpChecked: false,
    });
    g.state.line = [mk('langganan', 'es-teh'), mk('langganan', 'telur'), mk('hantu', 'es-teh')];
    const r = raw();
    without(r, 'telur');
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
