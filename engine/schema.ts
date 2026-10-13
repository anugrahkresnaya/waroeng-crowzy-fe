// Zod schemas for the content JSON. Bad data fails at load, never mid-game.
import { z } from 'zod';
import { DAY_PARTS } from './clock';
import { DENOMS } from './money';

const localized = z.object({ id: z.string().min(1), en: z.string().min(1) });
const positiveInt = z.number().int().positive();
const weight = z.number().min(0);

export const itemSchema = z.object({
  id: z.string().min(1),
  art: z.string().min(1),
  name: localized,
  category: z.enum(['makanan', 'minuman', 'lainnya']),
  price: positiveInt.refine((n) => n % 100 === 0, 'price must be a multiple of 100'),
  startStock: z.number().int().min(0),
  ageRestricted: z.boolean().default(false),
});

export const customerTypeSchema = z.object({
  id: z.string().min(1),
  art: z.string().min(1),
  name: localized,
  patienceMul: z.number().positive(),
  items: z.record(z.string(), z.number().positive()),
  distinctItems: z.tuple([positiveInt, positiveInt]),
  maxQty: positiveInt,
  payment: z.object({ cash: weight, qris: weight, kasbon: weight }),
  tender: z.enum(['exact-coins', 'round-up', 'big-note']),
  ageRange: z.tuple([positiveInt, positiveInt]),
  partWeights: z.object({
    morning: weight, lunch: weight, afternoon: weight, evening: weight, night: weight,
  }),
});

const partRates = z.object({
  morning: weight, lunch: weight, afternoon: weight, evening: weight, night: weight,
});

const range = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

export const activitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['heavy', 'light']),
  name: localized,
  /** Art id for the free-time list. */
  art: z.string().optional(),
  /** False while the system it needs (for example the market) is not built yet. */
  available: z.boolean().default(true),
  effects: z.object({
    mood: z.number().optional(),
    hunger: z.number().optional(),
    /** Money earned, a seeded roll between the two numbers. */
    cash: range.optional(),
    /** Money spent, a seeded roll between the two numbers. */
    cost: range.optional(),
  }),
});

export const balanceSchema = z.object({
  openMinute: z.number().int().min(0),
  closeMinute: z.number().int().min(1),
  lineCapacity: positiveInt,
  basePatience: positiveInt,
  arrivalPerMinute: partRates,
  weekdayMul: z.array(weight).length(7),
  arrivalReputationRange: z.tuple([weight, weight]),
  qrisFeeBp: z.number().int().min(0),
  noticeShortChange: z.number().min(0).max(1),
  prepMinutes: positiveInt,
  preOpenMinutes: positiveInt,
  prepareMinutes: positiveInt,
  exchangeMinutes: positiveInt,
  exchangeFeeBp: z.number().int().min(0),
  /** Phase 1 placeholder: the shelves refill overnight until the market app exists. */
  autoRestock: z.boolean(),
  penalties: z.object({ wrongTray: z.number().min(0), ktpCheck: z.number().min(0), decline: z.number().min(0) }),
  startReputation: z.number().min(0).max(100),
  reputation: z.object({
    happy: z.number(), neutral: z.number(), annoyed: z.number(), walkaway: z.number(), underage: z.number(),
    shortChangeCaught: z.number(), emptyOrder: z.number(), kasbonRefused: z.number(), turnedAway: z.number(), unplannedClosure: z.number(),
  }),
  startDrawer: z.record(z.string(), z.number().int().min(0)),
  maxDaysOff: z.number().int().min(0).max(7),
  defaultWorkDays: z.array(z.boolean()).length(7),
  offBlocks: z.array(z.object({ id: z.string().min(1), start: z.number().int(), end: z.number().int() })).min(1),
  defaultOffPlan: z.record(z.string(), z.array(z.string())),
  freeTime: z.object({ start: positiveInt, end: positiveInt, slotMinutes: positiveInt }),
  start: z.object({ mood: z.number().min(0).max(100), hunger: z.number().min(0).max(100) }),
  hungerPerHour: z.number().min(0),
  sleepHunger: z.number().min(0),
  moodFromDay: z.object({ happy: z.number(), annoyed: z.number(), walkaway: z.number(), min: z.number(), max: z.number() }),
});

export const contentSchema = z
  .object({
    items: z.array(itemSchema).min(1),
    customers: z.array(customerTypeSchema).min(1),
    balance: balanceSchema,
    activities: z.object({ dayOff: z.array(activitySchema).min(1), freeTime: z.array(activitySchema).min(1) }),
  })
  .superRefine((c, ctx) => {
    const problem = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path });
    const itemIds = new Set<string>();
    c.items.forEach((item, i) => {
      if (itemIds.has(item.id)) problem(`duplicate item id "${item.id}"`, ['items', i, 'id']);
      itemIds.add(item.id);
    });
    const typeIds = new Set<string>();
    c.customers.forEach((t, i) => {
      if (typeIds.has(t.id)) problem(`duplicate customer type "${t.id}"`, ['customers', i, 'id']);
      typeIds.add(t.id);
      for (const itemId of Object.keys(t.items)) {
        if (!itemIds.has(itemId)) problem(`unknown item "${itemId}"`, ['customers', i, 'items', itemId]);
      }
      if (t.payment.cash + t.payment.qris + t.payment.kasbon <= 0) problem('payment weights are all zero', ['customers', i, 'payment']);
      if (DAY_PARTS.every((p) => t.partWeights[p] === 0)) problem('partWeights are all zero', ['customers', i, 'partWeights']);
      if (t.distinctItems[0] > t.distinctItems[1]) problem('distinctItems min is above max', ['customers', i, 'distinctItems']);
      if (t.ageRange[0] > t.ageRange[1]) problem('ageRange min is above max', ['customers', i, 'ageRange']);
    });
    const dayOffIds = new Map(c.activities.dayOff.map((a) => [a.id, a]));
    const freeIds = new Set<string>();
    for (const [name, list] of [['dayOff', c.activities.dayOff], ['freeTime', c.activities.freeTime]] as const) {
      const seen = new Set<string>();
      list.forEach((a, i) => {
        if (seen.has(a.id)) problem(`duplicate activity "${a.id}"`, ['activities', name, i, 'id']);
        seen.add(a.id);
        if (name === 'freeTime') freeIds.add(a.id);
      });
    }
    const blockIds = new Set(c.balance.offBlocks.map((b) => b.id));
    c.balance.offBlocks.forEach((b, i) => {
      if (b.end <= b.start) problem('block end must be after start', ['balance', 'offBlocks', i]);
    });
    for (const [block, list] of Object.entries(c.balance.defaultOffPlan)) {
      if (!blockIds.has(block)) problem(`unknown block "${block}"`, ['balance', 'defaultOffPlan', block]);
      if (!isValidBlockPlan(list, (id) => dayOffIds.get(id))) problem(`invalid plan for block "${block}"`, ['balance', 'defaultOffPlan', block]);
    }
    if (c.balance.defaultWorkDays.filter((w) => !w).length > c.balance.maxDaysOff) problem('default plan has too many days off', ['balance', 'defaultWorkDays']);
    if (c.balance.freeTime.end <= c.balance.freeTime.start) problem('free time end must be after start', ['balance', 'freeTime']);
    if (c.balance.closeMinute <= c.balance.openMinute) problem('closeMinute must be after openMinute', ['balance', 'closeMinute']);
    for (const key of Object.keys(c.balance.startDrawer)) {
      if (!(DENOMS as readonly number[]).includes(Number(key))) problem(`"${key}" is not a rupiah denomination`, ['balance', 'startDrawer', key]);
    }
  });

export type Item = z.infer<typeof itemSchema>;
export type CustomerType = z.infer<typeof customerTypeSchema>;
export type Balance = z.infer<typeof balanceSchema>;
export type Activity = z.infer<typeof activitySchema>;

/**
 * A day-off block holds one heavy activity, or up to two light ones. Unavailable
 * and unknown activities are never allowed, and nothing may repeat.
 */
export function isValidBlockPlan(ids: readonly string[], lookup: (id: string) => Activity | undefined): boolean {
  if (new Set(ids).size !== ids.length) return false;
  const acts = ids.map(lookup);
  if (acts.some((a) => !a || !a.available)) return false;
  const heavy = acts.filter((a) => a!.kind === 'heavy').length;
  return heavy === 0 ? acts.length <= 2 : heavy === 1 && acts.length === 1;
}

export interface Content {
  items: Item[];
  itemById: Record<string, Item>;
  customers: CustomerType[];
  typeById: Record<string, CustomerType>;
  balance: Balance;
  activities: { dayOff: Activity[]; freeTime: Activity[] };
  activityById: Record<string, Activity>;
  freeTimeById: Record<string, Activity>;
}
