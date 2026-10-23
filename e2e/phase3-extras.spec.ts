import { expect, test } from "@playwright/test";
import { mutateGame, startGame, stateOf } from "./helpers";

test("the storeroom sells a bigger fridge once, and the meter grows", async ({ page }) => {
  await startGame(page);
  await page.getByRole("link", { name: "Gudang" }).first().click();
  await page.waitForURL(/\/gudang$/);
  await expect(page.getByTestId("buy-big-fridge")).toBeDisabled(); // the bank holds Rp1.000.000

  await mutateGame(page, "state.bank = content.market.bigFridge.price + 500000;");
  await expect(page.getByTestId("buy-big-fridge")).toBeEnabled();
  await page.getByTestId("buy-big-fridge").click();
  await expect(page.getByTestId("buy-big-fridge")).toHaveCount(0);
  await expect(page.getByText(/Kulkas kecil \d+(\.\d)?\/30/)).toBeVisible();
  expect((await stateOf(page)).bank).toBe(500000);
});

test("a power cut offers a generator and a sell-off of the cold stock", async ({ page }) => {
  await startGame(page);
  await mutateGame(
    page,
    "state.outage = { day: state.day, from: state.minute, hours: 8, known: false, ice: false }; state.bank = 2000000;" +
      "const ing = content.ingredients.find((i) => i.life.fridge !== null); state.pantry.push({ ingredient: ing.id, qty: ing.unitSize * 3, bought: state.day, unitCost: 2000, stored: 'fridge' });",
  );
  await expect(page.getByTestId("outage-banner")).toBeVisible();
  await expect(page.getByTestId("buy-generator")).toBeEnabled();
  await expect(page.getByTestId("sell-off")).toBeVisible();

  const before = await stateOf(page);
  await page.getByTestId("sell-off").click();
  await expect(page.getByTestId("sell-off")).toHaveCount(0);
  const after = await stateOf(page);
  expect(after.pantry.filter((l) => (l as { stored?: string }).stored === "fridge")).toHaveLength(0);
  expect(Object.entries(after.drawer).reduce((s, [d, n]) => s + Number(d) * n, 0)).toBeGreaterThan(Object.entries(before.drawer).reduce((s, [d, n]) => s + Number(d) * n, 0));

  await page.getByTestId("buy-generator").click();
  await expect(page.getByTestId("buy-generator")).toHaveCount(0);
  expect((await stateOf(page)).bank).toBeLessThan(2000000);
});

test("nugget goreng lists the frozen nuggets and cooks a batch from them", async ({ page }) => {
  await startGame(page);
  await mutateGame(page, "state.freezer = true; state.stock.nugget = 2; state.goodsCost.nugget = 32000; state.bank = 2000000;");
  await page.getByRole("link", { name: "Menu" }).first().click();
  await page.waitForURL(/\/menu$/);
  await page.getByText("Nugget goreng").first().scrollIntoViewIfNeeded();
  await expect(page.getByText("Nugget goreng").first()).toBeVisible();

  await page.getByRole("link", { name: "Dapur" }).first().click();
  await page.waitForURL(/\/dapur$/);
  await expect(page.getByTestId("needs-good-nugget")).toHaveCount(1);
  await page.getByTestId("cook-nugget-goreng").click();
  const s = await stateOf(page);
  expect(s.stock.nugget).toBe(1);
  expect((s as unknown as { display: Record<string, Array<{ qty: number }>> }).display["nugget-goreng"][0].qty).toBe(10);
});
