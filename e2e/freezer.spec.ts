import { expect, test } from "@playwright/test";
import { mutateGame, openApp, startGame, stateOf } from "./helpers";

test("the storeroom sells a freezer, and chicken and ice move into it", async ({ page }) => {
  await startGame(page);
  await page.getByRole("link", { name: "Gudang" }).first().click();
  await page.waitForURL(/\/gudang$/);
  const card = page.getByTestId("freezer-card");
  await expect(card).toContainText("Belum ada freezer");
  await expect(page.getByTestId("buy-freezer")).toBeDisabled(); // the bank holds Rp1.000.000

  await mutateGame(page, "state.bank = 3000000;");
  await page.getByTestId("buy-freezer").click();
  await expect(card).toContainText("slot");
  await expect(page.getByTestId("freezer-hold")).toContainText("jam");
  await expect(page.getByTestId("stock-ayam")).toContainText("di freezer");
  expect((await stateOf(page)).bank).toBe(3000000 - 1800000);
  await expect(page.getByTestId("buy-freezer")).toHaveCount(0);
});

test("frozen goods in the market need a freezer, cost a cold-transport fee, and arrive in it", async ({ page }) => {
  await startGame(page);
  await openApp(page, "pasar");
  await page.getByTestId("tab-barang").click();
  await expect(page.getByTestId("frozen-nugget")).toBeVisible();
  await page.getByTestId("product-g-nugget").click();
  await page.getByTestId("detail-plus").click();
  await page.getByTestId("to-cart").click();
  await expect(page.getByTestId("needs-freezer")).toBeVisible();
  await expect(page.getByTestId("pay-order")).toBeDisabled();

  await mutateGame(page, "state.bank = 5000000; state.freezer = true;");
  await expect(page.getByTestId("needs-freezer")).toHaveCount(0);
  await expect(page.getByTestId("cart-g-nugget")).toBeVisible();
  await expect(page.getByText("Ongkos dingin")).toBeVisible();
  await expect(page.getByTestId("pay-order")).toBeEnabled();
  await page.getByTestId("pay-order").click();
  const s = await stateOf(page);
  expect(s.orders.some((o) => o.status === "transit")).toBe(true);
});

test("a long cut warns about a thin freezer, and a shorter one does not", async ({ page }) => {
  await startGame(page);
  await mutateGame(page, "state.freezer = true; state.stock.sosis = 3; state.outage = { day: state.day, from: state.minute, hours: 8, known: false, ice: false };");
  await expect(page.getByTestId("freezer-risk")).toContainText("Freezer tidak akan tahan");
  await mutateGame(page, "state.outage.hours = 6;");
  await expect(page.getByTestId("freezer-risk")).toHaveCount(0); // 6 hours is within what a thin freezer holds
});
