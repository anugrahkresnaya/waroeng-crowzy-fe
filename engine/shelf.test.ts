import { describe, expect, it } from 'vitest';
import { content } from './content';
import { Game } from './game';
import { nextShelf, shelfCap, shelfPending, shelfRoom, shelfUsed } from './shelf';
import { kitchenContent, passDay } from './testing/fixtures';

const m = content.market.shelf;
const game = () => {
  const g = new Game(kitchenContent(), { seed: 1 });
  g.state.bank = 1e8;
  g.state.token = 1e9;
  return g;
};
/** Piles kerupuk on the shelf until `left` slots are free (kerupuk is 30 to a slot). */
const fill = (g: Game, left: number) => {
  g.state.stock.kerupuk += (shelfRoom(g.state, g.content) - left) * 30;
};
const buy = (g: Game, key: string, qty: number) => g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines: [{ key, qty }], express: false });

describe('the shelf', () => {
  it('starts with a little room to spare', () => {
    const g = game();
    expect(shelfCap(g.state, g.content)).toBe(m.slots);
    expect(shelfUsed(g.state, g.content)).toBeCloseTo(11, 6);
    expect(shelfRoom(g.state, g.content)).toBeCloseTo(m.slots - 11, 6);
    expect(shelfRoom(g.state, g.content)).toBeGreaterThanOrEqual(1.67); // room for a pack of anything
  });

  it('refuses an order that does not fit, counting what is already on the way, and changes nothing', () => {
    const g = game();
    fill(g, 1);
    expect(buy(g, 'g-permen', 1).ok).toBe(true); // 100 sweets are exactly the 1 slot left
    const g2 = game();
    fill(g2, 1);
    const snap = JSON.stringify(g2.state);
    expect(buy(g2, 'g-kerupuk', 2)).toEqual({ ok: false, error: 'shelf_full' });
    expect(JSON.stringify(g2.state)).toBe(snap);
    // the first order is on its way and holds its slots, so another that would overflow is refused
    expect(shelfPending(g.state, g.content)).toBeGreaterThan(0);
    expect(buy(g, 'g-permen', 1)).toEqual({ ok: false, error: 'shelf_full' });
  });

  it('selling frees slots again', () => {
    const g = game();
    fill(g, 1);
    expect(buy(g, 'g-kerupuk', 1)).toEqual({ ok: false, error: 'shelf_full' }); // 1.67 slots against 1
    g.state.stock.kerupuk -= 60; // two slots freed
    expect(buy(g, 'g-kerupuk', 1).ok).toBe(true);
  });

  it('an upgrade adds the slots, once per level, and needs the money', () => {
    const g = game();
    g.state.bank = m.upgrades[0].price - 1;
    expect(g.dispatch({ type: 'buyShelf' })).toEqual({ ok: false, error: 'insufficient_funds' });
    g.state.bank = 1e8;
    expect(g.dispatch({ type: 'buyShelf' }).ok).toBe(true);
    expect(shelfCap(g.state, g.content)).toBe(m.upgrades[0].slots);
    expect(g.state.bank).toBe(1e8 - m.upgrades[0].price);
    for (let i = 1; i < m.upgrades.length; i++) expect(g.dispatch({ type: 'buyShelf' }).ok).toBe(true);
    expect(nextShelf(g.state, g.content)).toBeNull();
    expect(g.dispatch({ type: 'buyShelf' })).toEqual({ ok: false, error: 'already_owned' });
    expect(buy(g, 'g-kerupuk', 2).ok).toBe(true);
    passDay(g);
    expect(g.state.stock.kerupuk).toBe(60 + 100);
  });
});
