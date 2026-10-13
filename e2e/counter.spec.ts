import { expect, test, type Page } from "@playwright/test";
import { categoryOf, cookAhead, frontCustomer, gameState, mutateGame, pause } from "./helpers";

async function startAndOpen(page: Page, exchange = false) {
  await page.goto("/");
  await page.getByTestId("start-chapter-1").click();
  await expect(page).toHaveURL(/\/beranda$/);
  if (exchange) {
    await page.getByTestId("pre-tukar").click();
    await page.getByTestId("do-exchange").click();
    // Changing money and preparing the shelves fill the pre-open block, so the display is stocked directly.
    await mutateGame(
      page,
      "for (const id of ['gorengan', 'nasi-bungkus', 'es-teh']) state.display[id] = [{ qty: 20, cookedAt: state.day * 1440 + 420, unitCost: 300 }];",
    );
  } else {
    await cookAhead(page);
  }
  await page.getByTestId("open-warung").click();
  await expect(page).toHaveURL(/\/kasir$/);
}

async function waitForCustomer(page: Page) {
  await expect.poll(async () => (await frontCustomer(page))?.id ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
}

/** Serves the customer at the counter the way a player would, with taps. */
async function serve(page: Page) {
  const c = await frontCustomer(page);
  expect(c).not.toBeNull();
  for (const line of c!.order) {
    await page.getByTestId(`cat-${await categoryOf(page, line.itemId)}`).click();
    for (let i = 0; i < line.qty; i++) await page.getByTestId(`item-${line.itemId}`).click();
  }
  await page.getByTestId("confirm-order").click();

  if (c!.method === "qris") await page.getByTestId("confirm-qris").click();
  else if (c!.method === "kasbon") await page.getByTestId("grant-kasbon").click();
  else {
    const after = await frontCustomer(page);
    if (after && after.stage === "change") {
      const tender = Object.entries(after.tender).reduce((s, [d, n]) => s + Number(d) * n, 0);
      let due = tender - after.bill;
      for (const d of [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100]) {
        while (due >= d) {
          await page.getByTestId(`piece-${d}`).click();
          due -= d;
        }
      }
      await page.getByTestId("give-change").click();
    }
  }
}

test("title screen starts chapter 1 and the language switch works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Warung Hidup" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByTestId("start-chapter-1")).toHaveText("Start");
  await page.getByRole("button", { name: "Indonesia" }).click();
  await expect(page.getByTestId("start-chapter-1")).toHaveText("Mulai");
});

test("without a game, game routes go back to the title", async ({ page }) => {
  await page.goto("/kasir");
  await expect(page).toHaveURL(/\/$/);
});

test("exchanging cash before opening uses pre-open time and charges the fee", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-chapter-1").click();
  await expect(page.getByTestId("pre-open-left")).toContainText("120");
  await page.getByTestId("pre-tukar").click();
  await page.getByTestId("do-exchange").click();
  await expect(page.getByTestId("pre-open-left")).toContainText("90");
  const s = await gameState(page);
  expect(s.stats.exchangeFees).toBe(1000);
  expect(s.preOpenUsed).toBe(30);
});

test("open the warung, serve customers by tap, and see them paid", async ({ page }) => {
  await startAndOpen(page, true);
  await waitForCustomer(page);
  await pause(page);
  await serve(page);
  await expect.poll(async () => (await gameState(page)).stats.served).toBeGreaterThanOrEqual(1);
});

test("dragging an item to the tray picks it", async ({ page }) => {
  await startAndOpen(page);
  await waitForCustomer(page);
  await pause(page);
  const c = await frontCustomer(page);
  const itemId = c!.order[0].itemId;
  await page.getByTestId(`cat-${await categoryOf(page, itemId)}`).click();
  await page.getByTestId(`item-${itemId}`).dragTo(page.getByTestId("tray"));
  await expect(page.getByTestId("tray").getByRole("button")).toHaveCount(1);
});

test("a wrong tray is refused and costs the customer patience, not a sale", async ({ page }) => {
  await startAndOpen(page);
  await waitForCustomer(page);
  await pause(page);
  await page.getByTestId("confirm-order").click();
  await expect.poll(async () => (await gameState(page)).stats.wrongTrays).toBe(1);
  expect((await gameState(page)).stats.served).toBe(0);
});

test("pausing stops the clock", async ({ page }) => {
  await startAndOpen(page);
  await page.getByTestId("pause").click();
  const before = await page.getByTestId("clock").textContent();
  await page.waitForTimeout(2500);
  expect(await page.getByTestId("clock").textContent()).toBe(before);
  await page.getByTestId("pause").click();
  await expect.poll(() => page.getByTestId("clock").textContent(), { timeout: 5000 }).not.toBe(before);
});

test("closing the shop shows the summary and leads on to the evening", async ({ page }) => {
  await startAndOpen(page);
  await waitForCustomer(page);
  await pause(page);
  await serve(page);
  await page.getByTestId("close-warung").click();
  await expect(page).toHaveURL(/\/ringkasan$/);
  await expect(page.getByTestId("summary")).toBeVisible();
  await page.getByTestId("to-night").click();
  await expect(page).toHaveURL(/\/malam$/);
});
