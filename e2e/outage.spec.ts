import { expect, test, type Page } from "@playwright/test";
import { mutateGame, openApp, pause, startGame, stateOf } from "./helpers";

test("a power cut: the notice, no cold drinks until ice is bought, and a lantern", async ({ page }) => {
  await startGame(page);
  // a cut that has just begun, long enough that the fridge will not hold
  await mutateGame(page, "state.outage = { day: state.day, from: state.minute, hours: 6, known: false, ice: false };");
  const banner = page.getByTestId("outage-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("data-power", "off");
  await expect(banner).toContainText("Listrik padam sampai");
  await expect(banner).toContainText("Kulkas tidak tahan");

  await page.getByRole("link", { name: "Dapur" }).first().click();
  await page.waitForURL(/\/dapur$/);
  await expect(page.getByTestId("cook-es-teh")).toBeDisabled();
  await expect(page.getByTestId("batch-es-teh")).toContainText("Listrik padam, tidak ada es batu");

  const bank = (await stateOf(page)).bank;
  await page.getByTestId("buy-ice").click();
  await expect(banner).toContainText("Es batu sudah dibeli");
  expect((await stateOf(page)).bank).toBeLessThan(bank);
  await expect(page.getByTestId("cook-es-teh")).toBeEnabled();

  await page.getByTestId("buy-lantern").click();
  await expect(banner).toContainText("Lentera siap");
  expect((await stateOf(page)).lantern).toBe(true);
});

test("a notice the day before shows tomorrow's cut", async ({ page }) => {
  await startGame(page);
  await mutateGame(page, "state.outage = { day: state.day + 1, from: 600, hours: 3, known: true, ice: false };");
  const banner = page.getByTestId("outage-banner");
  await expect(banner).toContainText("besok listrik padam");
  await expect(page.getByTestId("buy-ice")).toHaveCount(0); // ice only helps on the day itself
  await expect(page.getByTestId("buy-lantern")).toBeVisible();
});

test("a low electricity token warns, and a top-up from the banner fixes it", async ({ page }) => {
  await startGame(page);
  await expect(page.getByTestId("token-alert")).toHaveCount(0);
  await mutateGame(page, "state.token = 8000;");
  await expect(page.getByTestId("token-alert")).toContainText("menipis");
  const before = await stateOf(page);
  await page.getByTestId("buy-token").click();
  await expect(page.getByTestId("token-alert")).toHaveCount(0);
  const after = await stateOf(page);
  expect(after.token).toBe(before.token + 50000);
  expect(after.bank).toBe(before.bank - 52500);
});

test("an empty token turns the power off, and cold drinks stop until it is topped up", async ({ page }) => {
  await startGame(page);
  await mutateGame(page, "state.token = 0;");
  const banner = page.getByTestId("outage-banner");
  await expect(banner).toHaveAttribute("data-power", "off");
  await expect(banner).toContainText("Token listrik habis");
  await page.getByRole("link", { name: "Dapur" }).first().click();
  await page.waitForURL(/\/dapur$/);
  await expect(page.getByTestId("cook-es-teh")).toBeDisabled();
  await page.getByTestId("buy-token").click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId("cook-es-teh")).toBeEnabled();
});

test("the bank app tops up the token and pays the rent once it is near", async ({ page }) => {
  await startGame(page);
  await openApp(page, "bank");
  await expect(page.getByTestId("token-days")).toContainText("hari buka");
  await expect(page.getByTestId("pay-kontrakan")).toBeDisabled(); // due in two weeks

  const start = await stateOf(page);
  await page.getByTestId("token-20000").click();
  expect((await stateOf(page)).token).toBe(start.token + 20000);

  await mutateGame(page, "state.bills.kontrakan.dueDay = state.day + 1;");
  await expect(page.getByTestId("bill-kontrakan")).toContainText("Jatuh tempo 1 hari lagi");
  const before = await stateOf(page);
  await page.getByTestId("pay-kontrakan").click();
  const after = await stateOf(page);
  expect(after.bank).toBe(before.bank - 600000);
  expect(after.bills.kontrakan.dueDay).toBe(before.bills.kontrakan.dueDay + 30);
  await expect(page.getByTestId("pay-kontrakan")).toBeDisabled();
});

/** An open shop, paused, with a QRIS customer at the paying step and a PLN cut that began `elapsed` minutes ago. */
async function qrisCounter(page: Page, elapsed: number | null) {
  await startGame(page);
  await page.getByTestId("open-warung").click();
  await page.waitForURL(/\/kasir$/);
  await pause(page);
  const cut = elapsed === null ? "state.outage = null;" : `state.outage = { day: state.day, from: state.minute - ${elapsed}, hours: 14, known: false, ice: false };`;
  await mutateGame(
    page,
    `${cut} state.line = [{ id: state.nextCustomerId++, type: 'langganan', age: 30, order: [{ itemId: 'keripik', qty: 1 }], tray: { keripik: 1 }, patience: 200, maxPatience: 200, arrivedAt: state.tick, stage: 'paying', method: 'qris', bill: 2000, tender: {}, ktpChecked: false, cooked: {} }];`,
  );
}

test("QRIS: a long cut means the payment cannot be checked, and the player takes their word", async ({ page }) => {
  await qrisCounter(page, 400);
  await expect(page.getByTestId("qris-unverified")).toContainText("tidak ada sinyal");
  await expect(page.getByTestId("confirm-qris")).toHaveCount(0);
  const bank = (await stateOf(page)).bank;
  await page.getByTestId("trust-qris").click();
  const s = await stateOf(page);
  expect(s.stats.served).toBe(1);
  expect(s.qrisPending).toHaveLength(1);
  expect(s.bank).toBe(bank); // nothing arrived yet
});

test("QRIS: refusing an unchecked payment sends the customer away", async ({ page }) => {
  await qrisCounter(page, 400);
  await page.getByTestId("refuse-qris").click();
  const s = await stateOf(page);
  expect(s.stats.served).toBe(0);
  expect(s.stats.qrisRefused).toBe(1);
  await expect(page.getByTestId("qris-unverified")).toHaveCount(0);
});

test("QRIS: with the power on the payment is checked as usual", async ({ page }) => {
  await qrisCounter(page, null);
  await expect(page.getByTestId("qris-unverified")).toHaveCount(0);
  const data = (await stateOf(page)).phone.data;
  await page.getByTestId("confirm-qris").click();
  const s = await stateOf(page);
  expect(s.stats.served).toBe(1);
  expect(s.phone.data).toBeLessThan(data);
});

test("the phone screen shows its status and sells data for cash", async ({ page }) => {
  await startGame(page);
  await page.getByRole("link", { name: "Ponsel" }).click();
  await expect(page.getByTestId("phone-card")).toBeVisible();
  await expect(page.getByTestId("phone-signal")).toContainText("Sinyal bagus");
  const start = await stateOf(page);
  await page.getByTestId("buy-data-0").click();
  const after = await stateOf(page);
  expect(after.phone.data).toBe(start.phone.data + 500);
  expect(after.bank).toBe(start.bank); // paid in cash from the drawer
  await page.getByTestId("buy-powerbank").click();
  expect((await stateOf(page)).phone.powerbank).toBe(60);
  await expect(page.getByTestId("buy-powerbank")).toHaveCount(0);
});

test("a nearly empty data package warns on every screen and refills from the banner", async ({ page }) => {
  await startGame(page);
  await mutateGame(page, "state.phone.data = 50;");
  await expect(page.getByTestId("data-alert")).toContainText("hampir habis");
  await page.getByTestId("buy-data").click();
  await expect(page.getByTestId("data-alert")).toHaveCount(0);
  expect((await stateOf(page)).phone.data).toBe(550);
});

test("the market app cannot place an order with a dead phone or no data", async ({ page }) => {
  await startGame(page);
  await openApp(page, "pasar");
  await page.getByTestId("product-beras").click();
  await page.getByTestId("detail-plus").click();
  await page.getByTestId("to-cart").click();
  await expect(page.getByTestId("pay-order")).toBeEnabled();

  await mutateGame(page, "state.phone.data = 0;");
  await expect(page.getByTestId("phone-gate")).toContainText("Paket data habis");
  await expect(page.getByTestId("pay-order")).toBeDisabled();

  await mutateGame(page, "state.phone.data = 500; state.token = 0; state.phone.battery = 0;");
  await expect(page.getByTestId("phone-gate")).toContainText("HP mati");
  await expect(page.getByTestId("pay-order")).toBeDisabled();

  await mutateGame(page, "state.token = 50000; state.phone.battery = 50;");
  await expect(page.getByTestId("phone-gate")).toHaveCount(0);
  await expect(page.getByTestId("pay-order")).toBeEnabled();
});
