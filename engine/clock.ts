// Game clock helpers. One engine tick is one game minute.
export const MINUTES_PER_DAY = 1440;

export type DayPart = 'morning' | 'lunch' | 'afternoon' | 'evening' | 'night';
export const DAY_PARTS: readonly DayPart[] = ['morning', 'lunch', 'afternoon', 'evening', 'night'];

/** Which part of the open day a minute falls in (07.00 to 22.00), or null when closed hours. */
export function dayPart(minute: number): DayPart | null {
  if (minute >= 7 * 60 && minute < 11 * 60) return 'morning';
  if (minute >= 11 * 60 && minute < 14 * 60) return 'lunch';
  if (minute >= 14 * 60 && minute < 17 * 60) return 'afternoon';
  if (minute >= 17 * 60 && minute < 20 * 60) return 'evening';
  if (minute >= 20 * 60 && minute < 22 * 60) return 'night';
  return null;
}

/** 0 = Monday ... 6 = Sunday. */
export function weekday(day: number): number {
  return ((day % 7) + 7) % 7;
}

/** "07.05", the Indonesian way of writing the time. */
export function formatClock(minute: number): string {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}.${mm}`;
}
