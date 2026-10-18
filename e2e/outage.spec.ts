import { expect, test } from "@playwright/test";
import { mutateGame, startGame, stateOf } from "./helpers";

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
