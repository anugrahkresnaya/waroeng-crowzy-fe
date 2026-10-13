import { describe, expect, it } from 'vitest';
import activities from './content/activities.json';
import balance from './content/balance.json';
import customers from './content/customers.json';
import items from './content/items.json';
import { content, parseContent } from './content';

const raw = () => structuredClone({ items, customers, balance, activities }) as unknown as {
  items: typeof items;
  customers: typeof customers;
  balance: Omit<typeof balance, 'defaultOffPlan' | 'defaultWorkDays'> & { defaultOffPlan: Record<string, string[]>; defaultWorkDays: boolean[]; closeMinute: number };
  activities: { dayOff: Array<Record<string, unknown>>; freeTime: Array<Record<string, unknown>> };
};

describe('content', () => {
  it('loads the shipped content', () => {
    expect(content.items.length).toBeGreaterThan(10);
    expect(content.customers.map((c) => c.id).sort()).toEqual(['keluarga', 'langganan', 'ojol', 'pelajar', 'uang-besar']);
    expect(content.itemById['indomie-goreng'].price).toBe(4500);
  });

  it('rejects a customer that orders an unknown item', () => {
    const bad = raw();
    (bad.customers[0].items as unknown as Record<string, number>)['does-not-exist'] = 1;
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
    (bad.balance.startDrawer as unknown as Record<string, number>)['3000'] = 4;
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
