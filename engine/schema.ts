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
    shortChangeCaught: z.number(), emptyOrder: z.number(), kasbonRefused: z.number(), turnedAway: z.number(),
  }),
  startDrawer: z.record(z.string(), z.number().int().min(0)),
});

export const contentSchema = z
  .object({
    items: z.array(itemSchema).min(1),
    customers: z.array(customerTypeSchema).min(1),
    balance: balanceSchema,
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
    if (c.balance.closeMinute <= c.balance.openMinute) problem('closeMinute must be after openMinute', ['balance', 'closeMinute']);
    for (const key of Object.keys(c.balance.startDrawer)) {
      if (!(DENOMS as readonly number[]).includes(Number(key))) problem(`"${key}" is not a rupiah denomination`, ['balance', 'startDrawer', key]);
    }
  });

export type Item = z.infer<typeof itemSchema>;
export type CustomerType = z.infer<typeof customerTypeSchema>;
export type Balance = z.infer<typeof balanceSchema>;

export interface Content {
  items: Item[];
  itemById: Record<string, Item>;
  customers: CustomerType[];
  typeById: Record<string, CustomerType>;
  balance: Balance;
}
