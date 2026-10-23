import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { content } from './content';
import { STRATEGIES, compareStrategies, formatReport, runStrategy } from './testing/balance';

describe('the strategy harness', () => {
  it('plays every strategy for a fortnight without breaking the game', () => {
    for (const s of STRATEGIES) {
      const r = runStrategy(content, s, 1, 14);
      expect(Number.isFinite(r.netWorth), s.name).toBe(true);
      expect(r.reputation, s.name).toBeGreaterThanOrEqual(0);
      expect(r.reputation, s.name).toBeLessThanOrEqual(100);
      expect(r.served, `${s.name} served nobody`).toBeGreaterThan(0);
      expect(r.trail).toHaveLength(14);
    }
  });

  it('is deterministic: the same strategy and seed give the same month', () => {
    const a = runStrategy(content, STRATEGIES[0], 3, 12);
    const b = runStrategy(content, STRATEGIES[0], 3, 12);
    expect(a).toEqual(b);
  });
});

describe('gate 3: no single strategy wins', () => {
  const seeds = [1, 2, 3, 4];
  const days = 30;
  const result = compareStrategies(content, seeds, days);

  it('no strategy beats every other strategy on every seed', () => {
    expect(result.winners).toEqual([]);
  });

  it('the best strategy is not far ahead of the pack: the top median is under twice the median of the rest', () => {
    const medians = result.rows.map((r) => r.median).sort((a, b) => b - a);
    const rest = medians.slice(1);
    const typical = rest[Math.floor(rest.length / 2)];
    expect(medians[0]).toBeLessThan(typical * 2);
  });
});

// `npm run balance` writes the full report: 6 seeds, 45 days.
describe.runIf(process.env.BALANCE)('report', () => {
  it('writes the balance report', () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    const days = 45;
    const c = compareStrategies(content, seeds, days);
    writeFileSync(process.env.BALANCE_OUT ?? 'balance-report.md', formatReport(c, seeds, days));
  }, 600000);
});
