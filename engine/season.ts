// Seasons on the demand side: fasting, holidays and long weekends change who comes and what they ask for.
// Everything is derived from the day number, so nothing is saved.
import { addDays, inRange } from './calendar';
import { weekday } from './clock';
import type { DayPart } from './clock';
import type { Content } from './schema';

export interface DemandToday {
  /** Ids of the periods, holidays and long weekends that apply, for the UI. */
  ids: string[];
  arrivalMul: number;
  partMul: Partial<Record<DayPart, number>>;
  itemMul: Record<string, number>;
}

interface Effect {
  arrivalMul: number;
  partMul: Partial<Record<DayPart, number>>;
  itemMul: Record<string, number>;
}

const sameDate = (a: { year: number; month: number; day: number }, h: { year?: number; month: number; day: number }) =>
  (h.year === undefined || h.year === a.year) && h.month === a.month && h.day === a.day;

/** The holidays that fall on `day`. */
function holidaysOn(content: Content, day: number) {
  const date = addDays(content.market.calendarStart, day);
  return content.market.demand.holidays.filter((h) => sameDate(date, h));
}

/** A holiday on a Monday or Friday, and the weekend days next to it. */
function longWeekend(content: Content, day: number): boolean {
  const on = (d: number) => holidaysOn(content, d).length > 0;
  switch (weekday(day)) {
    case 0: return on(day); // Monday holiday
    case 4: return on(day); // Friday holiday
    case 5: return on(day - 1) || on(day + 2); // Saturday: Friday before, Monday after
    case 6: return on(day - 2) || on(day + 1);
    default: return false;
  }
}

export function demandOn(content: Content, day: number): DemandToday {
  const { demand, calendarStart } = content.market;
  const date = addDays(calendarStart, day);
  const ids: string[] = [];
  const effects: Effect[] = [];
  for (const p of demand.periods) {
    if (!inRange(date, p.from, p.to)) continue;
    ids.push(p.id);
    effects.push(p);
  }
  for (const h of holidaysOn(content, day)) {
    ids.push(h.id);
    effects.push(h);
  }
  if (longWeekend(content, day)) {
    ids.push('long-weekend');
    effects.push(demand.longWeekend);
  }
  const out: DemandToday = { ids, arrivalMul: 1, partMul: {}, itemMul: {} };
  for (const e of effects) {
    out.arrivalMul *= e.arrivalMul;
    for (const [part, m] of Object.entries(e.partMul) as Array<[DayPart, number]>) out.partMul[part] = (out.partMul[part] ?? 1) * m;
    for (const [item, m] of Object.entries(e.itemMul)) out.itemMul[item] = (out.itemMul[item] ?? 1) * m;
  }
  return out;
}

/** How much busier or quieter this part of today is than a plain day. */
export function seasonArrivalMul(content: Content, day: number, part: DayPart): number {
  const d = demandOn(content, day);
  return d.arrivalMul * (d.partMul[part] ?? 1);
}

/** What starts today or `noticeDays` from now and was not on the day before: the headlines of the night. */
export function seasonHeadlines(content: Content, day: number): Array<{ id: string; inDays: number }> {
  const out: Array<{ id: string; inDays: number }> = [];
  for (const inDays of new Set([0, content.market.demand.noticeDays])) {
    const now = demandOn(content, day + inDays).ids;
    const before = new Set(demandOn(content, day + inDays - 1).ids);
    for (const id of now) if (!before.has(id)) out.push({ id, inDays });
  }
  return out;
}
