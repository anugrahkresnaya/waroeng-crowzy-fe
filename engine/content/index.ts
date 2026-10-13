import activities from './activities.json';
import balance from './balance.json';
import ingredients from './ingredients.json';
import market from './market.json';
import suppliers from './suppliers.json';
import customers from './customers.json';
import items from './items.json';
import { parseContent } from './load';

/** The shipped Phase 1 content, validated once at import. */
export const content = parseContent({ items, ingredients, suppliers, market, customers, balance, activities });
export { parseContent } from './load';
