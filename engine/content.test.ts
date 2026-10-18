import { describe, expect, it } from 'vitest';
import { content, parseContent } from './content';
import { rawContent as raw } from './testing/raw-content';

describe('content', () => {
  it('loads the shipped content', () => {
    expect(content.items.length).toBeGreaterThan(10);
    expect(content.customers.map((c) => c.id).sort()).toEqual(['keluarga', 'langganan', 'ojol', 'pelajar', 'uang-besar']);
    expect(content.itemById['indomie-goreng'].price).toBe(4500);
  });

  it('rejects a customer that orders an unknown item', () => {
    const bad = raw();
    bad.customers[0].items['does-not-exist'] = 1;
    expect(() => parseContent(bad)).toThrow(/unknown item/);
  });

  it('rejects duplicate item ids', () => {
    const bad = raw();
    bad.items.push({ ...bad.items[0] });
    expect(() => parseContent(bad)).toThrow(/duplicate item id/);
  });

  it('rejects a price that is not a multiple of 100', () => {
    const bad = raw();
    bad.items[0].price = 4550;
    expect(() => parseContent(bad)).toThrow(/multiple of 100/);
  });

  it('rejects a start drawer with a fake denomination', () => {
    const bad = raw();
    bad.balance.startDrawer['3000'] = 4;
    expect(() => parseContent(bad)).toThrow(/denomination/);
  });

  it('rejects a close time before opening', () => {
    const bad = raw();
    bad.balance.closeMinute = 100;
    expect(() => parseContent(bad)).toThrow(/closeMinute/);
  });

  it('rejects a default plan with an activity that does not exist or breaks the block rule', () => {
    const unknown = raw();
    unknown.balance.defaultOffPlan.sore = ['tidak-ada'];
    expect(() => parseContent(unknown)).toThrow(/invalid plan for block/);
    const crowded = raw();
    crowded.balance.defaultOffPlan.sore = ['narik-ojol', 'cek-chat'];
    expect(() => parseContent(crowded)).toThrow(/invalid plan/);
  });

  it('rejects a default plan for a block that is not defined, or too many default days off', () => {
    const block = raw();
    block.balance.defaultOffPlan.subuh = [];
    expect(() => parseContent(block)).toThrow(/unknown block/);
    const days = raw();
    days.balance.defaultWorkDays = [false, false, false, true, true, true, true];
    expect(() => parseContent(days)).toThrow(/too many days off/);
  });

  it('rejects duplicate activity ids', () => {
    const dup = raw();
    dup.activities.dayOff.push({ ...dup.activities.dayOff[0] });
    expect(() => parseContent(dup)).toThrow(/duplicate activity/);
  });

  it('points every item and customer at an existing art asset', async () => {
    const { readFileSync } = await import('node:fs');
    const manifest: Array<{ id: string; category: string }> = JSON.parse(
      readFileSync(new URL('../public/assets/manifest.json', import.meta.url), 'utf8'),
    );
    const barang = new Set(manifest.filter((m) => m.category === 'barang').map((m) => m.id));
    const pelanggan = new Set(manifest.filter((m) => m.category === 'pelanggan').map((m) => m.id));
    for (const item of content.items) expect(barang.has(item.art), item.id).toBe(true);
    for (const type of content.customers) {
      for (const mood of ['happy', 'neutral', 'annoyed']) expect(pelanggan.has(`${type.art}-${mood}`), `${type.id}-${mood}`).toBe(true);
    }
  });
});

describe('market content', () => {
  it('loads 25 ingredients with the PRD base prices and 3 suppliers', () => {
    expect(content.ingredients).toHaveLength(25);
    expect(content.ingredientById['telur'].price).toBe(30000);
    expect(content.ingredientById['cabai'].price).toBe(78000);
    expect(content.ingredientById['lpg'].price).toBe(22000);
    expect(content.suppliers.map((s) => s.id)).toEqual(['pak-slamet', 'toko-maju', 'grosir-induk']);
  });

  it('makes a market product of every ingredient and every resale good', () => {
    const goods = content.items.filter((i) => i.kind === 'good' && !i.consign); // consigned goods are never bought on the market
    expect(content.products).toHaveLength(25 + goods.length);
    expect(content.productByKey['g-kue-basah']).toBeUndefined();
    expect(content.productByKey['g-rokok'].base).toBe(18000 * 10);
    expect(content.productByKey['beras'].kind).toBe('ingredient');
  });

  it('every dish uses ingredients that exist, and every ingredient has art', async () => {
    const { readFileSync } = await import('node:fs');
    const manifest: Array<{ id: string }> = JSON.parse(readFileSync(new URL('../public/assets/manifest.json', import.meta.url), 'utf8'));
    const ids = new Set(manifest.map((m) => m.id));
    for (const ing of content.ingredients) expect(ids.has(ing.art), ing.id).toBe(true);
    for (const item of content.items.filter((i) => i.kind === 'dish')) {
      for (const id of Object.keys(item.recipe!)) expect(content.ingredientById[id], `${item.id} needs ${id}`).toBeDefined();
    }
  });

  it('rejects a recipe that uses an unknown ingredient', () => {
    const bad = raw();
    bad.items.find((i) => i.id === 'es-teh')!.recipe['teh-celup'] = 1;
    expect(() => parseContent(bad)).toThrow(/unknown ingredient/);
  });

  it('rejects a dish without a recipe and a good without a buy price', () => {
    const noRecipe = raw();
    delete noRecipe.items.find((i) => i.id === 'es-teh')!.recipe;
    expect(() => parseContent(noRecipe)).toThrow(/recipe/);
    const noBuy = raw();
    delete noBuy.items.find((i) => i.id === 'permen')!.buyPrice;
    expect(() => parseContent(noBuy)).toThrow(/buyPrice/);
  });

  it('rejects a start pantry or start goods that point at the wrong thing', () => {
    const pantry = raw();
    pantry.balance.start.pantry['tidak-ada'] = 1;
    expect(() => parseContent(pantry)).toThrow(/unknown ingredient/);
    const goods = raw();
    goods.balance.start.goods['es-teh'] = 5; // a dish, not a resale good
    expect(() => parseContent(goods)).toThrow(/not a resale good/);
  });

  it('rejects a season or event that targets something that does not exist', () => {
    const season = raw();
    season.market.seasons[0].effects[0].match = ['durian'];
    expect(() => parseContent(season)).toThrow(/unknown match/);
    const event = raw();
    event.market.events[0].effects[0].match = ['durian'];
    expect(() => parseContent(event)).toThrow(/unknown match/);
  });

  it('rejects duplicate suppliers and ingredients', () => {
    const sup = raw();
    sup.suppliers.push({ ...sup.suppliers[0] });
    expect(() => parseContent(sup)).toThrow(/duplicate supplier/);
    const ing = raw();
    ing.ingredients.push({ ...ing.ingredients[0] });
    expect(() => parseContent(ing)).toThrow(/duplicate ingredient/);
  });
});
