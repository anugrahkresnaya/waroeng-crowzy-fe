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

interface RawRecord {
  id: string;
  savedAt: number;
  data: { format?: number; state?: { day: number; phase: string; preOpenUsed: number; line: Array<{ id: number }> }; log?: unknown[] } | string | null;
}

/** Reads a record straight from IndexedDB, bypassing the app (database "warung", store "saves"). */
export async function readRecord(page: Page, id: "main" | "backup"): Promise<RawRecord | null> {
  return page.evaluate(
    (key) =>
      new Promise<RawRecord | null>((resolve, reject) => {
        const open = indexedDB.open("warung");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("saves")) {
            db.close();
            resolve(null);
            return;
          }
          const get = db.transaction("saves", "readonly").objectStore("saves").get(key);
          get.onsuccess = () => {
            db.close();
            resolve((get.result as RawRecord | undefined) ?? null);
          };
          get.onerror = () => reject(get.error);
        };
      }),
    id,
  );
}

/** Overwrites a record with anything, to simulate damage or a newer game. */
export async function plantRecord(page: Page, id: "main" | "backup", data: unknown) {
  await page.evaluate(
    ({ key, value }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("warung");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("saves", "readwrite");
          tx.objectStore("saves").put({ id: key, savedAt: Date.now(), data: value });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { key: id, value: data },
  );
}

/** Starts a fresh game on the title screen and lands on the pre-open home. */
export async function startGame(page: Page) {
  await page.goto("/");
  await page.getByTestId("start-chapter-1").click();
  await page.waitForURL(/\/beranda$/);
}

/** Opens a phone app by its icon, through the tab bar like a player would. */
export async function openApp(page: Page, app: "pasar" | "bank" | "berita" | "jadwal") {
  await page.getByRole("link", { name: "Ponsel" }).click();
  await page.getByTestId(`app-${app}`).click();
}

/** Opens and straight away closes the shop, ending on the summary. */
export async function closeDay(page: Page) {
  await page.getByTestId("open-warung").click();
  await page.waitForURL(/\/kasir$/);
  await page.getByTestId("close-warung").click();
  await page.waitForURL(/\/ringkasan$/);
}

/** From the summary through free time to the question about tomorrow. */
export async function toTomorrowQuestion(page: Page) {
  await page.getByTestId("to-night").click();
  await page.waitForURL(/\/malam$/);
  await page.getByTestId("sleep").click();
  await page.waitForURL(/\/besok$/);
}

/** Close the shop, sleep, and wake up to the next day (the start screen of that day). */
export async function passTheNight(page: Page) {
  if (!/\/(beranda|kasir)$/.test(page.url())) await page.getByRole("link", { name: "Kasir" }).click();
  await closeDay(page);
  await toTomorrowQuestion(page);
  await page.getByTestId("go-to-bed").click();
}

/** Changes the running game directly, for setting up a situation (a price spike, an empty bank). */
export async function mutateGame(page: Page, change: string) {
  await page.evaluate((body) => {
    const w = window as unknown as {
      __warung: { store: { getState: () => { game: { state: unknown; snapshot: () => unknown } }; setState: (s: unknown) => void }; content: unknown };
    };
    const { store, content } = w.__warung;
    const game = store.getState().game;
    new Function("state", "content", body)(game.state, content);
    store.setState({ state: game.snapshot() });
  }, change);
}

/** The whole game state, as plain data. */
export async function stateOf(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __warung: { store: { getState: () => { state: unknown } } } };
    return JSON.parse(JSON.stringify(w.__warung.store.getState().state)) as {
      day: number;
      phase: string;
      bank: number;
      drawer: Record<string, number>;
      pantry: Array<{ ingredient: string; qty: number; bought: number }>;
      stock: Record<string, number>;
      orders: Array<{ id: number; status: string; late: boolean; express: boolean; total: number; supplier: string; arriveDay: number }>;
      menu: Record<string, { price: number; portion: string }>;
      market: { prices: Record<string, number>; history: Record<string, number[]>; news: unknown[]; active: unknown[] };
      stats: { qrisRefused: number; qrisFake: number; cogs: number; served: number; waste: number; cooking: Record<string, number>; moods: Record<string, number> };
      burners: Array<{ item: string } | null>;
      preOpenUsed: number;
      lantern: boolean;
      token: number;
      phone: { battery: number; powerbank: number | null; data: number };
      qrisPending: Array<{ amount: number; fake: boolean }>;
      bills: Record<string, { dueDay: number }>;
    };
  });
}

/** Cooks one batch of gorengan and es teh in the kitchen, the way a player fills the display before opening. */
export async function cookAhead(page: Page) {
  await page.getByTestId("to-kitchen").click();
  await page.getByTestId("cook-gorengan").click();
  await page.getByTestId("cook-es-teh").click();
  await page.getByRole("link", { name: "Hari ini" }).click();
  await page.waitForURL(/\/beranda$/);
}

/** Moves the game clock on by whole game minutes while the clock is paused, so cooking can be timed exactly. */
export async function advanceMinutes(page: Page, minutes: number) {
  await page.evaluate((n) => {
    const w = window as unknown as {
      __warung: { store: { getState: () => { game: { tick: () => unknown; snapshot: () => unknown } }; setState: (s: unknown) => void } };
    };
    const { store } = w.__warung;
    const game = store.getState().game;
    for (let i = 0; i < n; i++) game.tick();
    store.setState({ state: game.snapshot() });
  }, minutes);
}

/** How many minutes a dish needs on the stove to come out just right, or null when it is not cooked to order. */
export async function cookMinutes(page: Page, itemId: string): Promise<number | null> {
  return page.evaluate((id) => {
    const w = window as unknown as { __warung: { content: { itemById: Record<string, { cook?: { minutes: number } }> } } };
    return w.__warung.content.itemById[id].cook?.minutes ?? null;
  }, itemId);
}
