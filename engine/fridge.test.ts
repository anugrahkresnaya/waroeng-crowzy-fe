import { describe, expect, it } from 'vitest';
import { content } from './content';
import { Game } from './game';
import { assignStorage, fridgeCap, fridgeUsed } from './market';
import { kitchenContent } from './testing/fixtures';

const m = content.market;

/** A game whose pantry holds more fridge-friendly stock than the small fridge takes. */
function crowded(): Game {
  const g = new Game(kitchenContent(), { seed: 1 });
  const ing = content.ingredients.find((i) => i.life.fridge !== null && (i.life.room === null || i.life.fridge > i.life.room))!;
  g.state.pantry = [{ ingredient: ing.id, qty: ing.unitSize * (m.bigFridge.capacity - 2), bought: 0, unitCost: 1, stored: 'room' }];
  assignStorage(g.state, g.content);
  return g;
}

describe('the bigger fridge', () => {
  it('holds more cold stock than the small one', () => {
    const g = crowded();
    expect(fridgeCap(g.state, g.content)).toBe(m.fridgeCapacity);
    expect(fridgeUsed(g.state, g.content)).toBeLessThanOrEqual(m.fridgeCapacity + 1e-9);
    const before = fridgeUsed(g.state, g.content);
    g.state.bank = m.bigFridge.price;
    const r = g.dispatch({ type: 'buyBigFridge' });
    expect(r.ok).toBe(true);
    expect(g.state.bank).toBe(0);
    expect(fridgeCap(g.state, g.content)).toBe(m.bigFridge.capacity);
    expect(fridgeUsed(g.state, g.content)).toBeGreaterThan(before);
  });

  it('is bought once and needs the money, and a refusal changes nothing', () => {
    const g = crowded();
    g.state.bank = m.bigFridge.price - 1;
    const snap = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'buyBigFridge' })).toEqual({ ok: false, error: 'insufficient_funds' });
    expect(JSON.stringify(g.state)).toBe(snap);
    g.state.bank = m.bigFridge.price * 2;
    g.dispatch({ type: 'buyBigFridge' });
    expect(g.dispatch({ type: 'buyBigFridge' })).toEqual({ ok: false, error: 'already_owned' });
  });
});
