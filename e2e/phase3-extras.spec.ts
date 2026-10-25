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

test("the shelf is limited: an order that does not fit is blocked until the shelf is upgraded", async ({ page }) => {
  await startGame(page);
  await mutateGame(page, "state.bank = 5000000; state.stock.kerupuk = 60 + 30 * 3;");
  await page.getByRole("link", { name: "Gudang" }).first().click();
  await page.waitForURL(/\/gudang$/);
  await page.getByTestId("storage-barang").click();
  await expect(page.getByTestId("shelf-card")).toContainText("slot");
  await expect(page.getByTestId("buy-shelf")).toBeEnabled();

  await page.getByRole("link", { name: "Ponsel" }).click();
  await page.getByTestId("app-pasar").click();
  await page.getByTestId("tab-barang").click();
  await page.getByTestId("product-g-kerupuk").click();
  await page.getByTestId("detail-plus").click();
  await page.getByTestId("detail-plus").click();
  await page.getByTestId("to-cart").click();
  await expect(page.getByTestId("shelf-full")).toBeVisible();
  await expect(page.getByTestId("pay-order")).toBeDisabled();

  await mutateGame(page, "state.shelfLevel = 2;");
  await expect(page.getByTestId("shelf-full")).toHaveCount(0);
  await expect(page.getByTestId("pay-order")).toBeEnabled();
});

test("a work-day pasar trip sells frozen goods without a freezer, and warns when they melt", async ({ page }) => {
  await startGame(page);
  await mutateGame(page, "state.bank = 3000000;");
  await expect(page.getByTestId("start-trip")).toBeEnabled();
  await page.getByTestId("start-trip").click();
  await expect(page.getByTestId("to-pasar")).toBeVisible();
  await expect(page.getByTestId("start-trip")).toHaveCount(0);

  await page.getByTestId("to-pasar").click();
  await page.waitForURL(/\/pasar$/);
  await expect(page.getByTestId("trip-banner")).toBeVisible();
  await page.getByTestId("tab-barang").click();
  await page.getByTestId("product-g-nugget").click();
  await page.getByTestId("detail-plus").click();
  await page.getByTestId("to-cart").click();
  await expect(page.getByTestId("needs-freezer")).toHaveCount(0);
  await page.getByTestId("trip-buy").click();

  const s = await stateOf(page);
  expect(s.stock.nugget).toBe(5);
  expect((s as unknown as { melt: unknown[] }).melt).toHaveLength(1);
  await page.getByRole("navigation", { name: "Menu utama" }).getByRole("link").first().click();
  await page.waitForURL(/\/beranda$/);
  await expect(page.getByTestId("melt-warning")).toContainText("meleleh");
});
