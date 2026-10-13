/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke the content JSON on purpose, so its shape is deliberately loose */
import activities from '../content/activities.json';
import balance from '../content/balance.json';
import customers from '../content/customers.json';
import ingredients from '../content/ingredients.json';
import items from '../content/items.json';
import market from '../content/market.json';
import suppliers from '../content/suppliers.json';

/** A loose copy of all the content JSON, for tests that break it on purpose or tweak a number. */
export interface RawContent {
  items: Array<Record<string, any> & { id: string }>;
  ingredients: Array<Record<string, any> & { id: string }>;
  suppliers: Array<Record<string, any> & { id: string }>;
  customers: Array<Record<string, any> & { items: Record<string, number> }>;
  market: Record<string, any> & { events: Array<Record<string, any>>; seasons: Array<Record<string, any>> };
  balance: Record<string, any> & { start: Record<string, any>; defaultOffPlan: Record<string, string[]>; defaultWorkDays: boolean[] };
  activities: { dayOff: Array<Record<string, any>>; freeTime: Array<Record<string, any>> };
}

export const rawContent = (): RawContent =>
  structuredClone({ items, ingredients, suppliers, market, customers, balance, activities }) as unknown as RawContent;
