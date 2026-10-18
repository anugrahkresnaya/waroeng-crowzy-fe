import { contentSchema, type Content, type Product, goodKey } from '../schema';

/** Validates raw content and builds the lookup maps the engine uses. Throws a ZodError on bad data. */
export function parseContent(raw: unknown): Content {
  const parsed = contentSchema.parse(raw);
  const products: Product[] = [
    ...parsed.ingredients.map((i): Product => ({ key: i.id, kind: 'ingredient', id: i.id, category: i.category, base: i.price, swing: i.swing })),
    ...parsed.items
      .filter((i) => i.kind === 'good' && !i.consign)
      .map((i): Product => ({ key: goodKey(i.id), kind: 'good', id: i.id, category: 'goods', base: (i.buyPrice ?? 0) * (i.pack ?? 1), swing: 'low' })),
  ];
  return {
    items: parsed.items,
    itemById: Object.fromEntries(parsed.items.map((i) => [i.id, i])),
    ingredients: parsed.ingredients,
    ingredientById: Object.fromEntries(parsed.ingredients.map((i) => [i.id, i])),
    suppliers: parsed.suppliers,
    supplierById: Object.fromEntries(parsed.suppliers.map((s) => [s.id, s])),
    market: parsed.market,
    products,
    productByKey: Object.fromEntries(products.map((p) => [p.key, p])),
    customers: parsed.customers,
    typeById: Object.fromEntries(parsed.customers.map((t) => [t.id, t])),
    balance: parsed.balance,
    activities: parsed.activities,
    activityById: Object.fromEntries(parsed.activities.dayOff.map((a) => [a.id, a])),
    freeTimeById: Object.fromEntries(parsed.activities.freeTime.map((a) => [a.id, a])),
  };
}
