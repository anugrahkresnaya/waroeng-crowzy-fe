import { expect, test } from "@playwright/test";
import { closeDay, mutateGame, startGame, stateOf } from "./helpers";

test("titipan is not offered at first, then a neighbour hands over goods that go back unsold", async ({ page }) => {
  await startGame(page);
  await page.getByRole("link", { name: "Titipan" }).first().click();
  await page.waitForURL(/\/titipan$/);
  await expect(page.getByTestId("titipan-locked")).toContainText("hari ke-11");

  await mutateGame(page, "state.day = 10;");
  await expect(page.getByTestId("titipan-locked")).toHaveCount(0);
  await expect(page.getByTestId("titipan-trust")).toContainText("Tingkat 1");
  await page.getByTestId("take-kue-basah-5").click();
  await expect(page.getByTestId("taken-kue-basah")).toHaveText("5");
  const s = await stateOf(page);
  expect(s.stock["kue-basah"]).toBe(5);
  expect(s.preOpenUsed).toBeGreaterThan(0);

  await page.getByRole("link", { name: "Hari ini" }).first().click();
  await page.waitForURL(/\/beranda$/);
  await closeDay(page);
  await expect(page.getByTestId("titipan-summary")).toContainText("dikembalikan 5");
  const after = await stateOf(page);
  expect(after.stock["kue-basah"]).toBe(0);
  expect(after.bank).toBe(s.bank); // nothing sold, nothing paid
});

test("what the bank could not cover stays owed until it is paid", async ({ page }) => {
  await startGame(page);
  await mutateGame(page, "state.day = 10; state.titipan.owed = 7000;");
  await page.getByRole("link", { name: "Titipan" }).first().click();
  await expect(page.getByTestId("titipan-owed")).toContainText("7.000");
  await expect(page.getByTestId("take-kue-basah-1")).toBeDisabled();
  const bank = (await stateOf(page)).bank;
  await page.getByTestId("pay-neighbor").click();
  await expect(page.getByTestId("titipan-owed")).toHaveCount(0);
  expect((await stateOf(page)).bank).toBe(bank - 7000);
  await expect(page.getByTestId("take-kue-basah-1")).toBeEnabled();
});

test("consigned goods never show up in the market app", async ({ page }) => {
  await startGame(page);
  await mutateGame(page, "state.day = 10;");
  await page.getByRole("link", { name: "Ponsel" }).click();
  await page.getByTestId("app-pasar").click();
  await page.getByTestId("tab-barang").click();
  await expect(page.locator('[data-testid^="product-g-"]')).toHaveCount(14);
  await expect(page.getByTestId("product-g-kue-basah")).toHaveCount(0);
});
