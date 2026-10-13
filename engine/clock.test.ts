import { describe, expect, it } from 'vitest';
import { dayPart, formatClock, weekday } from './clock';

describe('clock', () => {
  it('maps minutes to day parts at the boundaries', () => {
    expect(dayPart(6 * 60 + 59)).toBeNull();
    expect(dayPart(7 * 60)).toBe('morning');
    expect(dayPart(11 * 60)).toBe('lunch');
    expect(dayPart(14 * 60)).toBe('afternoon');
    expect(dayPart(17 * 60)).toBe('evening');
    expect(dayPart(20 * 60)).toBe('night');
    expect(dayPart(22 * 60)).toBeNull();
  });

  it('formats time with a dot', () => {
    expect(formatClock(7 * 60 + 5)).toBe('07.05');
    expect(formatClock(0)).toBe('00.00');
    expect(formatClock(23 * 60 + 59)).toBe('23.59');
  });

  it('wraps weekdays with Monday as 0', () => {
    expect(weekday(0)).toBe(0);
    expect(weekday(6)).toBe(6);
    expect(weekday(7)).toBe(0);
    expect(weekday(-1)).toBe(6);
  });
});
