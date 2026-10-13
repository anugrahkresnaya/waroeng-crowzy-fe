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
      reputation: number;
      mood: number;
      hunger: number;
      workDays: boolean[];
      offPlan: Record<string, string[]>;
      blockIndex: number;
      planConfirmed: boolean;
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

/** Jumps the game to a state a test needs (for example Sunday night). The page follows the phase by itself. */
export async function patchGame(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((p) => {
    const w = window as unknown as {
      __warung: { store: { getState: () => { game: { state: Record<string, unknown>; snapshot: () => unknown } }; setState: (s: unknown) => void } };
    };
    const { store } = w.__warung;
    const game = store.getState().game;
    Object.assign(game.state, p);
    store.setState({ state: game.snapshot() });
  }, patch);
}
