import { describe, expect, it } from 'vitest';
import { Rng, seedToState } from './rng';

const make = (seed: number) => new Rng({ rng: seedToState(seed) });

describe('Rng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = make(7);
    const b = make(7);
    expect(Array.from({ length: 20 }, () => a.float())).toEqual(Array.from({ length: 20 }, () => b.float()));
  });

  it('gives different sequences for different seeds', () => {
    expect(make(1).float()).not.toBe(make(2).float());
  });

  it('keeps floats in [0, 1) and averages near 0.5', () => {
    const r = make(3);
    let sum = 0;
    for (let i = 0; i < 5000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      sum += f;
    }
    expect(sum / 5000).toBeGreaterThan(0.47);
    expect(sum / 5000).toBeLessThan(0.53);
  });

  it('int() stays inside the inclusive range and reaches both ends', () => {
    const r = make(4);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(2, 5));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('resumes the same sequence from a saved state', () => {
    const holder = { rng: seedToState(9) };
    const r = new Rng(holder);
    r.float();
    r.float();
    const saved = holder.rng;
    const expected = [r.float(), r.float()];
    const resumed = new Rng({ rng: saved });
    expect([resumed.float(), resumed.float()]).toEqual(expected);
  });

  it('weighted() never picks a zero-weight entry and follows the weights', () => {
    const r = make(5);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 4000; i++) counts[r.weighted([['a', 3], ['b', 1], ['c', 0]] as const)]++;
    expect(counts.c).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.4);
    expect(counts.a / counts.b).toBeLessThan(3.8);
  });

  it('weighted() throws when every weight is zero', () => {
    expect(() => make(1).weighted([['a', 0]] as const)).toThrow();
  });
});
