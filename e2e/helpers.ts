import type { Page } from "@playwright/test";

/** Reads from the game through the dev-only window hook. */
export async function frontCustomer(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __warung: { store: { getState: () => { state: { line: Array<Record<string, unknown>> } } } } };
    return (w.__warung.store.getState().state.line[0] ?? null) as null | {
      id: number;
      stage: string;
      method: string;
      bill: number;
      order: Array<{ itemId: string; qty: number }>;
      tender: Record<string, number>;
    };
  });
}

export async function gameState(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __warung: { store: { getState: () => { state: Record<string, unknown> } } } };
    return JSON.parse(JSON.stringify(w.__warung.store.getState().state)) as {
      phase: string;
      day: number;
      minute: number;
      drawer: Record<string, number>;
      stats: { served: number; wrongTrays: number; exchangeFees: number };
      preOpenUsed: number;
      line: Array<{ id: number }>;
    };
  });
}

export async function categoryOf(page: Page, itemId: string) {
  return page.evaluate((id) => {
    const w = window as unknown as { __warung: { content: { itemById: Record<string, { category: string }> } } };
    return w.__warung.content.itemById[id].category;
  }, itemId);
}

/** Pause the clock so a test can act without customers walking away. */
export async function pause(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __warung: { store: { getState: () => { setPaused: (p: boolean) => void } } } };
    w.__warung.store.getState().setPaused(true);
  });
}
