import { describe, expect, it } from 'vitest';
import {
  bigNotes, exactPieces, exchangeBreakdown, hasPieces, isValidPieces, makeChange, payOutBestEffort, removePieces,
  smallestNoteAtLeast, total,
} from './money';

describe('money', () => {
  it('totals pieces', () => {
    expect(total({ 50000: 2, 2000: 3, 500: 1 })).toBe(106500);
  });

  it('exactPieces uses the fewest pieces and rejects odd amounts', () => {
    expect(exactPieces(76500)).toEqual({ 50000: 1, 20000: 1, 5000: 1, 1000: 1, 500: 1 });
    expect(exactPieces(0)).toEqual({});
    expect(exactPieces(150)).toBeNull();
  });

  it('makeChange finds exact change from what the drawer holds', () => {
    const drawer = { 5000: 2, 2000: 1, 1000: 1, 500: 1 };
    const change = makeChange(3500, drawer);
    expect(change).not.toBeNull();
    expect(total(change!)).toBe(3500);
    expect(hasPieces(drawer, change!)).toBe(true);
  });

  it('makeChange avoids a greedy dead end', () => {
    // Greedy would take the 5.000 and then be stuck with 2 left over; 2.000 x3 works.
    expect(makeChange(6000, { 5000: 1, 2000: 3 })).toEqual({ 2000: 3 });
  });

  it('makeChange returns null when the drawer cannot make the amount', () => {
    expect(makeChange(3000, { 50000: 2, 2000: 1 })).toBeNull();
    expect(makeChange(100, {})).toBeNull();
    expect(makeChange(99, { 100: 5 })).toBeNull();
  });

  it('payOutBestEffort pays as much as it can', () => {
    expect(total(payOutBestEffort({ 2000: 1, 1000: 1 }, 5000))).toBe(3000);
    expect(payOutBestEffort({ 5000: 1 }, 5000)).toEqual({ 5000: 1 });
  });

  it('removePieces takes pieces out of a drawer', () => {
    const drawer = { 5000: 3, 1000: 2 };
    removePieces(drawer, { 5000: 1, 1000: 2 });
    expect(drawer).toEqual({ 5000: 2, 1000: 0 });
  });

  it('smallestNoteAtLeast picks the next note and handles big bills', () => {
    expect(smallestNoteAtLeast(4500)).toEqual({ 5000: 1 });
    expect(smallestNoteAtLeast(5000)).toEqual({ 5000: 1 });
    expect(smallestNoteAtLeast(21000)).toEqual({ 50000: 1 });
    expect(total(smallestNoteAtLeast(123500))).toBe(130000);
  });

  it('bigNotes covers the bill with 100.000 notes', () => {
    expect(bigNotes(4500)).toEqual({ 100000: 1 });
    expect(bigNotes(100500)).toEqual({ 100000: 2 });
  });

  it('isValidPieces rejects unknown denominations and bad counts', () => {
    expect(isValidPieces({ 5000: 1 })).toBe(true);
    expect(isValidPieces({ 3000: 1 })).toBe(false);
    expect(isValidPieces({ 5000: -1 })).toBe(false);
    expect(isValidPieces({ 5000: 1.5 })).toBe(false);
  });
});

describe('exchangeBreakdown', () => {
  it('splits an amount into a usable mix that adds up exactly', () => {
    for (const net of [49000, 98000, 147000]) {
      const out = exchangeBreakdown(net);
      expect(total(out)).toBe(net);
      expect(out[10000]).toBeGreaterThan(0);
    }
  });
});
