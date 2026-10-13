import { contentSchema, type Content } from '../schema';

/** Validates raw content and builds the lookup maps the engine uses. Throws a ZodError on bad data. */
export function parseContent(raw: unknown): Content {
  const parsed = contentSchema.parse(raw);
  return {
    items: parsed.items,
    itemById: Object.fromEntries(parsed.items.map((i) => [i.id, i])),
    customers: parsed.customers,
    typeById: Object.fromEntries(parsed.customers.map((t) => [t.id, t])),
    balance: parsed.balance,
    activities: parsed.activities,
    activityById: Object.fromEntries(parsed.activities.dayOff.map((a) => [a.id, a])),
    freeTimeById: Object.fromEntries(parsed.activities.freeTime.map((a) => [a.id, a])),
  };
}
