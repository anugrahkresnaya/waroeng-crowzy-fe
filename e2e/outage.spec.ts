import { expect, test } from "@playwright/test";
import { mutateGame, openApp, startGame, stateOf } from "./helpers";

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
