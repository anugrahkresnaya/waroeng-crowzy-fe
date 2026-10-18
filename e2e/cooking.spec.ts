import { expect, test, type Page } from "@playwright/test";
import { advanceMinutes, mutateGame, pause, startGame, stateOf } from "./helpers";

/** Opens the shop and puts a customer at the counter who wants the given dishes, paying by QRIS. */
async function counterWith(page: Page, order: Array<{ itemId: string; qty: number }>) {
  await startGame(page);
  await page.getByTestId("open-warung").click();
  await page.waitForURL(/\/kasir$/);
  await pause(page);
  await mutateGame(
    page,
    `state.line = [{ id: state.nextCustomerId++, type: 'langganan', age: 30, order: ${JSON.stringify(order)}, tray: {}, patience: 200, maxPatience: 200, arrivedAt: state.tick, stage: 'ordering', method: 'qris', bill: ${order.reduce((s, l) => s + (l.itemId === "es-teh" ? 3000 : 4500) * l.qty, 0)}, tender: {}, ktpChecked: false, cooked: {} }];`,
  );
  await expect(page.getByTestId("stove")).toBeVisible();
}

test("put a dish on the stove, lift it in the green, and it is served as a perfect plate", async ({ page }) => {
  await counterWith(page, [{ itemId: "indomie-goreng", qty: 1 }]);
  await page.getByTestId("item-indomie-goreng").click();
  await expect(page.getByTestId("burner-0")).toHaveAttribute("data-zone", "kurang");
  await advanceMinutes(page, 4);
  await expect(page.getByTestId("burner-0")).toHaveAttribute("data-zone", "kurang");
  await advanceMinutes(page, 4);
  await expect(page.getByTestId("burner-0")).toHaveAttribute("data-zone", "pas");
  await expect(page.getByRole("progressbar", { name: "Kompor 1" })).toHaveAttribute("aria-valuetext", "Pas matang");
  await page.getByTestId("lift-0").click();
  await expect(page.getByTestId("plated-indomie-goreng")).toContainText("★");
  await page.getByTestId("confirm-order").click();
  await page.getByTestId("confirm-qris").click();
  const s = await stateOf(page);
  expect(s.stats.served).toBe(1);
  expect(s.stats.cooking.pas).toBe(1);
});

test("lifting too early or too late spoils the dish, and the customer is not happy", async ({ page }) => {
  await counterWith(page, [{ itemId: "indomie-goreng", qty: 2 }]);
  await page.getByTestId("item-indomie-goreng").click();
  await page.getByTestId("item-indomie-goreng").click();
  await expect(page.getByTestId("burner-1")).toHaveAttribute("data-zone", "kurang");
  await page.getByTestId("lift-0").click(); // straight away: raw
  await advanceMinutes(page, 14);
  await expect(page.getByTestId("burner-1")).toHaveAttribute("data-zone", "gosong");
  await page.getByTestId("lift-1").click();
  await expect(page.getByTestId("plated-indomie-goreng")).toContainText("✕✕");
  await page.getByTestId("confirm-order").click();
  await page.getByTestId("confirm-qris").click();
  const s = await stateOf(page);
  expect(s.stats.cooking).toMatchObject({ kurang: 1, gosong: 1, pas: 0 });
  expect(s.stats.moods.annoyed).toBe(1);
});

test("the stove has two burners, and a third dish waits", async ({ page }) => {
  await counterWith(page, [{ itemId: "indomie-goreng", qty: 3 }]);
  for (let i = 0; i < 3; i++) await page.getByTestId("item-indomie-goreng").click();
  await expect(page.getByRole("status")).toContainText("Kompor penuh");
  expect((await stateOf(page)).burners.filter((b) => b).length).toBe(2);
});

test("auto-cook frees your hands but never reaches a perfect plate", async ({ page }) => {
  await counterWith(page, [{ itemId: "indomie-goreng", qty: 1 }]);
  await page.getByTestId("cook-auto").click();
  await page.getByTestId("item-indomie-goreng").click();
  await expect(page.getByTestId("burner-0")).toHaveAttribute("data-zone", "auto");
  await expect(page.getByTestId("lift-0")).toHaveCount(0);
  await advanceMinutes(page, 11);
  await expect(page.getByTestId("plated-indomie-goreng")).toHaveCount(0);
  await advanceMinutes(page, 1);
  await expect(page.getByTestId("plated-indomie-goreng")).toContainText("•");
  expect((await stateOf(page)).stats.cooking.biasa).toBe(1);
});

test("practice shows: after enough perfect plates the green zone gets wider", async ({ page }) => {
  await counterWith(page, [{ itemId: "indomie-goreng", qty: 1 }]);
  await mutateGame(page, "state.skill['indomie-goreng'] = 8;");
  await page.getByTestId("item-indomie-goreng").click();
  await advanceMinutes(page, 12); // two minutes later than the normal window allows
  await expect(page.getByTestId("burner-0")).toHaveAttribute("data-zone", "pas");
});

test("with the gas gone the stove refuses, and a tank bought at the stove gets it going again", async ({ page }) => {
  await counterWith(page, [{ itemId: "indomie-goreng", qty: 1 }]);
  await mutateGame(page, "state.pantry = state.pantry.filter((l) => l.ingredient !== 'lpg');");
  await expect(page.getByTestId("stove-gas")).toContainText("Gas habis");
  await page.getByTestId("item-indomie-goreng").click();
  await expect(page.getByText("Gas habis, beli tabung di kompor")).toBeVisible();
  expect((await stateOf(page)).burners).toEqual([null, null]);

  const before = (await stateOf(page)).bank;
  await page.getByTestId("buy-gas-stove").click();
  await expect(page.getByTestId("stove-gas")).toContainText("1 tabung");
  expect((await stateOf(page)).bank).toBeLessThan(before);
  await advanceMinutes(page, 15); // fetching the tank keeps you from the counter
  await page.getByTestId("item-indomie-goreng").click();
  expect((await stateOf(page)).burners[0]).not.toBeNull();
});
