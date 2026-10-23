import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { addDays } from './calendar';
import { content } from './content';
import { demandOn, seasonArrivalMul, seasonHeadlines } from './season';
import { weekday } from './clock';

/** The game day whose date is `month`/`day` in `year`. */
function dayOf(year: number, month: number, day: number): number {
  for (let d = 0; d < 800; d++) {
    const x = addDays(content.market.calendarStart, d);
    if (x.year === year && x.month === month && x.day === day) return d;
  }
  throw new Error('date out of range');
}

describe('seasons on the demand side', () => {
  it('a plain day changes nothing', () => {
    const d = demandOn(content, 0);
    expect(d.ids).toEqual([]);
    expect(d.arrivalMul).toBe(1);
    expect(seasonArrivalMul(content, 0, 'lunch')).toBe(1);
  });

  it('Ramadan empties the days and fills the evening', () => {
    const day = dayOf(2027, 2, 20);
    expect(demandOn(content, day).ids).toContain('ramadan');
    expect(seasonArrivalMul(content, day, 'lunch')).toBeLessThan(0.6);
    expect(seasonArrivalMul(content, day, 'evening')).toBeGreaterThan(1.5);
    expect(demandOn(content, day).itemMul['es-teh']).toBeGreaterThan(1);
  });

  it('a Friday holiday makes a long weekend of the days around it', () => {
    const fri = dayOf(2026, 12, 25);
    expect(weekday(fri)).toBe(4);
    expect(demandOn(content, fri).ids).toEqual(expect.arrayContaining(['christmas', 'long-weekend']));
    expect(demandOn(content, fri + 1).ids).toContain('long-weekend');
    expect(demandOn(content, fri + 2).ids).toContain('long-weekend');
    expect(demandOn(content, fri + 3).ids).not.toContain('long-weekend');
    expect(demandOn(content, fri - 1).ids).not.toContain('long-weekend');
  });

  it('a Wednesday holiday does not', () => {
    const wed = dayOf(2027, 3, 10);
    expect(weekday(wed)).toBe(2);
    expect(demandOn(content, wed).ids).not.toContain('long-weekend');
  });

  it('warns noticeDays ahead and again on the day', () => {
    const start = dayOf(2027, 2, 8);
    const n = content.market.demand.noticeDays;
    expect(seasonHeadlines(content, start - n)).toContainEqual({ id: 'ramadan', inDays: n });
    expect(seasonHeadlines(content, start)).toContainEqual({ id: 'ramadan', inDays: 0 });
    expect(seasonHeadlines(content, start + 1).find((h) => h.id === 'ramadan')).toBeUndefined();
  });

  it('announces it overnight', () => {
    const g = new Game(content, { seed: 1 });
    const start = dayOf(2027, 2, 8);
    g.state.day = start - content.market.demand.noticeDays - 1;
    g.state.phase = 'bed';
    const r = g.dispatch({ type: 'nextDay' });
    expect(r.ok && r.events.some((e) => e.type === 'season_notice' && e.id === 'ramadan')).toBe(true);
  });
});
