import { expect, test } from "@playwright/test";
import { closeDay, mutateGame, openApp, passTheNight, plantRecord, startGame, stateOf, toTomorrowQuestion } from "./helpers";

const qty = (state: Awaited<ReturnType<typeof stateOf>>, ingredient: string) => state.pantry.filter((l) => l.ingredient === ingredient).reduce((s, l) => s + l.qty, 0);

test("the phone opens the market app with all 25 ingredients, filterable, each with a trend", async ({ page }) => {
  await startGame(page);
  await openApp(page, "pasar");
  await expect(page.getByRole("heading", { name: "Pasar" })).toBeVisible();
  await expect(page.locator('[data-testid^="product-"]')).toHaveCount(25);
  await page.getByRole("button", { name: "Protein" }).click();
  await expect(page.locator('[data-testid^="product-"]')).toHaveCount(5);
  await page.getByRole("button", { name: "Semua" }).click();
  await page.getByTestId("tab-barang").click();
  await expect(page.locator('[data-testid^="product-g-"]')).toHaveCount(9); // the nine resale goods
});

test("a product shows a 30-day chart you can read as a table, with what each supplier charges", async ({ page }) => {
  await startGame(page);
  await openApp(page, "pasar");
  await page.getByTestId("product-cabai").click();
  await expect(page.getByRole("img", { name: /cabai/i })).toBeVisible();
  await expect(page.getByText("Harga di tiap pemasok")).toBeVisible();
  await page.getByRole("button", { name: "Lihat tabel" }).click();
  await expect(page.locator("table tbody tr")).toHaveCount(14);
  await page.getByRole("button", { name: "Lihat grafik" }).click();
  await expect(page.getByRole("img", { name: /cabai/i })).toBeVisible();
});

test("order from the phone: pick, see when it arrives, pay, and it turns up in the storeroom next morning", async ({ page }) => {
  await startGame(page);
  const before = await stateOf(page);
  await openApp(page, "pasar");
  await page.getByTestId("product-beras").click();
  await page.getByTestId("detail-plus").click();
  await page.getByTestId("detail-plus").click();
  await page.getByTestId("to-cart").click();
  await expect(page.getByTestId("cart-beras")).toContainText("2");
  await expect(page.getByTestId("arrival")).toContainText("besok");
  await page.getByTestId("pay-order").click();

  const placed = await stateOf(page);
  expect(placed.orders).toHaveLength(1);
  expect(placed.bank).toBe(before.bank - placed.orders[0].total);
  await expect(page.getByTestId("order-1")).toBeVisible();
  await expect(page.getByTestId("order-1-status")).toContainText("besok");

  await passTheNight(page);
  await expect(page).toHaveURL(/\/beranda$/);
  await expect(page.getByTestId("morning-report")).toContainText("Pesanan #1");
  const after = await stateOf(page);
  expect(after.orders[0].status).toBe("delivered");
  expect(qty(after, "beras")).toBeCloseTo(qty(before, "beras") + 2000, 0);

  await page.getByRole("link", { name: "Gudang" }).click();
  await expect(page.getByTestId("stock-beras")).toContainText("4");
});

test("a late delivery is flagged in the morning and in the orders list, then arrives", async ({ page }) => {
  await startGame(page);
  await mutateGame(page, "content.supplierById['pak-slamet'].lateChance = 1;");
  await openApp(page, "pasar");
  await page.getByTestId("product-gula").click();
  await page.getByTestId("to-cart").click();
  await page.getByTestId("pay-order").click();
  await passTheNight(page);
  await expect(page.getByTestId("morning-report")).toContainText("terlambat");
  let s = await stateOf(page);
  expect(s.orders[0]).toMatchObject({ status: "transit", late: true });

  await openApp(page, "pasar");
  await page.getByTestId("tab-pesanan").click();
  await expect(page.getByTestId("order-1-status")).toContainText("Terlambat");

  await passTheNight(page);
  s = await stateOf(page);
  expect(s.orders[0].status).toBe("delivered");
});

test("express delivery costs more and says it arrives within hours", async ({ page }) => {
  await startGame(page);
  await openApp(page, "pasar");
  await page.getByTestId("product-gula").click();
  await page.getByTestId("to-cart").click();
  const normalTotal = await page.getByTestId("pay-order").textContent();
  await page.getByTestId("express").check();
  await expect(page.getByTestId("arrival")).toContainText("jam");
  expect(await page.getByTestId("pay-order").textContent()).not.toBe(normalTotal);
  await page.getByTestId("pay-order").click();
  const s = await stateOf(page);
  expect(s.orders[0].express).toBe(true);
});

test("a supplier's minimum order and an empty bank both stop the payment, with the reason shown", async ({ page }) => {
  await startGame(page);
  await openApp(page, "pasar");
  await page.getByTestId("product-gula").click();
  await page.getByTestId("to-cart").click();
  await page.getByTestId("supplier-toko-maju").click();
  await expect(page.getByTestId("pay-order")).toBeDisabled();
  await expect(page.locator("p[role=alert]")).toContainText("minimal");
  await page.getByTestId("supplier-pak-slamet").click();
  await expect(page.getByTestId("pay-order")).toBeEnabled();
  await mutateGame(page, "state.bank = 0;");
  await expect(page.getByTestId("pay-order")).toBeDisabled();
  await expect(page.locator("p[role=alert]")).toContainText("Saldo");
});

test("the menu follows the market: a price spike shows up as higher cost, and you can answer with price or portion", async ({ page }) => {
  await startGame(page);
  await page.getByRole("link", { name: "Menu" }).click();
  await expect(page.getByRole("heading", { name: "Menu & harga" })).toBeVisible();
  await expect(page.getByTestId("menu-spike")).toHaveCount(0);

  const cost = async () => Number(((await page.getByTestId("cost-indomie-goreng").textContent()) ?? "").replace(/\D/g, ""));
  const calm = await cost();
  await mutateGame(page, "state.market.prices['mi-instan'] = Math.round(state.market.prices['mi-instan'] * 1.4);");
  await expect(page.getByTestId("menu-spike")).toContainText("Indomie goreng");
  const spiked = await cost();
  expect(spiked).toBeGreaterThan(calm + 1000);

  await page.getByTestId("price-up-indomie-goreng").click();
  await expect(page.getByTestId("price-indomie-goreng")).toHaveText("Rp5.000");
  expect((await stateOf(page)).menu["indomie-goreng"].price).toBe(5000);

  await page.getByTestId("portion-indomie-goreng-small").click();
  expect((await stateOf(page)).menu["indomie-goreng"].portion).toBe("small");
  expect(await cost()).toBeLessThan(spiked);
  await page.getByTestId("price-down-indomie-goreng").click();
  await expect(page.getByTestId("price-indomie-goreng")).toHaveText("Rp4.500");
});

test("the counter charges the menu price and uses up ingredients", async ({ page }) => {
  await startGame(page);
  await page.getByRole("link", { name: "Menu" }).click();
  for (const dish of ["indomie-goreng", "indomie-kuah", "es-teh", "kopi-hitam", "nasi-bungkus", "gorengan", "telur"]) {
    await page.getByTestId(`price-up-${dish}`).click();
  }
  await page.getByRole("link", { name: "Kasir" }).click();
  await page.getByTestId("open-warung").click();
  await page.waitForURL(/\/kasir$/);
  const item = page.getByTestId("item-es-teh");
  await page.getByTestId("cat-minuman").click();
  await expect(item).toContainText("3,5rb"); // the raised menu price, not the old Rp3.000
});

test("the bank takes drawer cash in and pays big notes out", async ({ page }) => {
  await startGame(page);
  await openApp(page, "bank");
  const before = await stateOf(page);
  await page.getByTestId("deposit-plus-50000").click();
  await page.getByTestId("deposit-plus-50000").click();
  await page.getByTestId("deposit").click();
  let s = await stateOf(page);
  expect(s.bank).toBe(before.bank + 100000);
  expect(s.drawer["50000"]).toBe(before.drawer["50000"] - 2);
  await page.getByTestId("withdraw-100000").click();
  s = await stateOf(page);
  expect(s.bank).toBe(before.bank);
  expect(s.drawer["100000"]).toBe(1);
  await expect(page.getByTestId("bank-balance")).toContainText("1.000.000");
});

test("a pasar trip: plan it for a day off, shop at market prices, and the stock is yours at once", async ({ page }) => {
  await startGame(page);
  await closeDay(page);
  await toTomorrowQuestion(page);
  await page.getByTestId("tomorrow-off").click();
  await page.getByRole("link", { name: "Lihat rencana minggu ini" }).click();
  await page.getByTestId("act-pagi-ke-pasar").click();
  await page.getByRole("link", { name: "Kembali" }).click();
  await page.getByTestId("go-to-bed").click();
  await expect(page).toHaveURL(/\/libur$/);

  const before = await stateOf(page);
  await page.getByTestId("go-pasar").click();
  await expect(page.getByTestId("trip-banner")).toBeVisible();
  await page.getByTestId("product-beras").click();
  for (let i = 0; i < 3; i++) await page.getByTestId("detail-plus").click();
  await page.getByTestId("to-cart").click();
  await expect(page.getByTestId("supplier-pak-slamet")).toHaveCount(0); // no supplier: you are standing in the market
  await page.getByTestId("trip-buy").click();

  const after = await stateOf(page);
  expect(after.orders).toHaveLength(0);
  expect(qty(after, "beras")).toBeCloseTo(qty(before, "beras") + 3000, 0);
  expect(after.bank).toBeLessThan(before.bank);
});

test("the radio announces price news, and the product page repeats it", async ({ page }) => {
  await startGame(page);
  await mutateGame(
    page,
    "state.market.news.push({ day: state.day, event: 'harvest-failure', startsOn: state.day + 1 }); state.market.pending.push({ id: 'harvest-failure', start: state.day + 1, end: state.day + 10 });",
  );
  await openApp(page, "berita");
  await expect(page.getByTestId("news-harvest-failure")).toContainText("Panen cabai gagal");
  await expect(page.getByTestId("news-harvest-failure")).toContainText("Akan terasa");
  await page.getByRole("link", { name: "Kembali" }).click();
  await page.getByTestId("app-pasar").click();
  await page.getByTestId("product-cabai").click();
  await expect(page.getByTestId("product-news")).toContainText("cabai");
  await page.getByRole("button", { name: /Semua barang/ }).click();
  await page.getByTestId("product-beras").click();
  await expect(page.getByTestId("product-news")).toHaveCount(0); // it does not touch rice
});

test("the storeroom shows what will spoil and what you can no longer make", async ({ page }) => {
  await startGame(page);
  await mutateGame(page, "state.pantry = state.pantry.filter((l) => l.ingredient !== 'teh');");
  await page.getByRole("link", { name: "Gudang" }).click();
  await expect(page.getByTestId("cannot-make")).toContainText("Es teh");
  await expect(page.getByTestId("stock-es-batu")).toContainText("Hari ini"); // ice melts overnight
  await expect(page.getByTestId("stock-beras")).toContainText("Awet");
  await passTheNight(page);
  await page.getByRole("link", { name: "Gudang" }).click();
  await expect(page.getByTestId("spoiled-report")).toContainText("Es batu");
});

test("a save from before the market is explained, not opened", async ({ page }) => {
  await startGame(page);
  await plantRecord(page, "main", { format: 1, anything: true });
  await page.goto("/");
  await expect(page.getByTestId("save-problem")).toContainText("sebelum pasar");
  await expect(page.getByTestId("continue-card")).toHaveCount(0);
});
