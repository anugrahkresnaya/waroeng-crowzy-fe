// A plain calendar for seasons: the game day number to a real date, with no use of the wall clock.
export interface CalDate {
  year: number;
  month: number;
  day: number;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) => (m === 2 && isLeap(y) ? 29 : DAYS_IN_MONTH[m - 1]);

/** The date `n` days after (or before, when negative) `start`. */
export function addDays(start: CalDate, n: number): CalDate {
  let { year, month, day } = start;
  let left = n;
  while (left > 0) {
    day++;
    if (day > daysIn(year, month)) {
      day = 1;
      if (++month > 12) {
        month = 1;
        year++;
      }
    }
    left--;
  }
  while (left < 0) {
    day--;
    if (day < 1) {
      if (--month < 1) {
        month = 12;
        year--;
      }
      day = daysIn(year, month);
    }
    left++;
  }
  return { year, month, day };
}

/** Whether a date falls in a yearly range that may wrap over New Year (November to March). */
export function inRange(date: CalDate, from: { month: number; day: number }, to: { month: number; day: number }): boolean {
  const v = date.month * 100 + date.day;
  const a = from.month * 100 + from.day;
  const b = to.month * 100 + to.day;
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
}
