import { expect, test, type Page } from "@playwright/test";
import { gameState, patchGame } from "./helpers";

async function startGame(page: Page) {
  await page.goto("/");
  await page.getByTestId("start-chapter-1").click();
  await expect(page).toHaveURL(/\/beranda$/);
}

/** Opens and straight away closes the shop, ending up on the summary. */
async function closeDay(page: Page) {
  await page.getByTestId("open-warung").click();
  await expect(page).toHaveURL(/\/kasir$/);
  await page.getByTestId("close-warung").click();
  await expect(page).toHaveURL(/\/ringkasan$/);
}

async function toTomorrowQuestion(page: Page) {
  await page.getByTestId("to-night").click();
  await expect(page).toHaveURL(/\/malam$/);
  await page.getByTestId("sleep").click();
  await expect(page).toHaveURL(/\/besok$/);
}

test("evening flow: summary, free time, tomorrow's question, then Tuesday begins", async ({ page }) => {
  await startGame(page);
  await closeDay(page);
  await toTomorrowQuestion(page);
  await expect(page.getByText("Selasa", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("tomorrow-note")).toContainText("07.00");
  await page.getByTestId("go-to-bed").click();
  await expect(page).toHaveURL(/\/beranda$/);
  const s = await gameState(page);
  expect(s.day).toBe(1);
  expect(s.phase).toBe("idle");
});

test("free time effects preview before sleeping, and cannot exceed four slots", async ({ page }) => {
  await startGame(page);
  await closeDay(page);
  await page.getByTestId("to-night").click();
  await expect(page.getByTestId("night-left")).toContainText("1 j 30");
  await page.getByTestId("free-tv").click();
  await page.getByTestId("free-chat").click();
  await page.getByTestId("free-game").click();
  await expect(page.getByTestId("night-left")).toContainText("0 j 0");
  await page.getByTestId("free-makan").click(); // deselect dinner
  await expect(page.getByTestId("night-left")).toContainText("0 j 30");
  const before = await gameState(page);
  await page.getByTestId("sleep").click();
  await expect(page).toHaveURL(/\/besok$/);
  const after = await gameState(page);
  expect(after.mood).toBeGreaterThan(before.mood);
});

test("closing tomorrow without a plan costs reputation and starts a day off", async ({ page }) => {
  await startGame(page);
  await closeDay(page);
  await toTomorrowQuestion(page);
  const before = (await gameState(page)).reputation;
  await page.getByTestId("tomorrow-off").click();
  await expect(page.getByTestId("tomorrow-note")).toContainText("reputasi");
  await page.getByTestId("go-to-bed").click();
  await expect(page).toHaveURL(/\/libur$/);
  expect((await gameState(page)).reputation).toBeLessThan(before);
});

test("a day off: run the four blocks, then free time", async ({ page }) => {
  await startGame(page);
  await closeDay(page);
  await toTomorrowQuestion(page);
  await page.getByTestId("tomorrow-off").click();
  await page.getByTestId("go-to-bed").click();
  await expect(page).toHaveURL(/\/libur$/);
  await expect(page.getByTestId("block-pagi")).toContainText("Selesai").catch(() => undefined);

  const mood = (await gameState(page)).mood;
  for (let i = 0; i < 4; i++) {
    await expect.poll(async () => (await gameState(page)).blockIndex).toBe(i);
    await page.getByTestId("run-block").click();
  }
  await expect(page).toHaveURL(/\/malam$/);
  expect((await gameState(page)).mood).toBeGreaterThan(mood);
});

test("the planner allows two days off and refuses a third", async ({ page }) => {
  await startGame(page);
  await closeDay(page);
  await toTomorrowQuestion(page);
  await page.getByRole("link", { name: "Lihat rencana minggu ini" }).click();
  await expect(page).toHaveURL(/\/jadwal$/);
  await expect(page.getByTestId("days-off")).toContainText("1/2");
  await page.getByTestId("day-1").click();
  await expect(page.getByTestId("days-off")).toContainText("2/2");
  await page.getByTestId("day-2").click();
  await expect(page.getByTestId("days-off")).toContainText("2/2");
  await expect(page.getByRole("status")).toContainText("Maksimal 2");
  expect((await gameState(page)).workDays).toEqual([true, false, true, true, true, false, true]);
  await page.getByRole("link", { name: "Kembali" }).click();
  await expect(page).toHaveURL(/\/besok$/);
  await page.getByTestId("go-to-bed").click(); // Tuesday is a planned day off now
  await expect(page).toHaveURL(/\/libur$/);
});

test("day-off blocks follow the one-heavy-or-two-light rule", async ({ page }) => {
  await startGame(page);
  await closeDay(page);
  await toTomorrowQuestion(page);
  await page.getByRole("link", { name: "Lihat rencana minggu ini" }).click();
  await page.getByTestId("act-sore-cek-chat").click();
  await page.getByTestId("act-sore-istirahat").click();
  expect((await gameState(page)).offPlan.sore).toEqual(["cek-chat", "istirahat"]);
  await page.getByTestId("act-sore-cuci-baju").click(); // a third light one does not fit
  await expect(page.getByRole("status")).toContainText("penuh");
  expect((await gameState(page)).offPlan.sore).toEqual(["cek-chat", "istirahat"]);
  await page.getByTestId("act-sore-narik-ojol").click(); // a heavy one replaces them
  expect((await gameState(page)).offPlan.sore).toEqual(["narik-ojol"]);
  await page.getByTestId("act-sore-ke-pasar").click(); // the market is open now, so a pasar trip can be planned
  expect((await gameState(page)).offPlan.sore).toEqual(["ke-pasar"]);
});

test("Sunday night asks for next week's plan before the tomorrow question", async ({ page }) => {
  await startGame(page);
  await patchGame(page, { day: 6, phase: "bed", minute: 1440 });
  await expect(page).toHaveURL(/\/jadwal$/);
  await expect(page.getByTestId("confirm-plan")).toBeVisible();
  await page.getByTestId("day-3").click();
  await page.getByTestId("confirm-plan").click();
  await expect(page).toHaveURL(/\/besok$/);
  expect((await gameState(page)).planConfirmed).toBe(true);
  await page.getByTestId("go-to-bed").click();
  const s = await gameState(page);
  expect(s.day).toBe(7); // Monday of the next week, planned work
  expect(s.phase).toBe("idle");
  expect(s.planConfirmed).toBe(true); // it asks again when the next Sunday arrives
});

test("the tab bar follows the evening and the day off", async ({ page }) => {
  await startGame(page);
  await closeDay(page);
  await page.getByTestId("to-night").click();
  await page.getByRole("link", { name: "Kasir" }).click();
  await expect(page).toHaveURL(/\/malam$/); // the evening is still where the day is
  await page.getByRole("link", { name: "Ringkasan" }).click();
  await expect(page).toHaveURL(/\/malam$/);
});

test("the tomorrow answer survives a look at the planner", async ({ page }) => {
  await startGame(page);
  await closeDay(page);
  await toTomorrowQuestion(page);
  await page.getByTestId("tomorrow-off").click();
  await page.getByRole("link", { name: "Lihat rencana minggu ini" }).click();
  await page.getByRole("link", { name: "Kembali" }).click();
  await expect(page.getByTestId("tomorrow-off")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("go-to-bed").click();
  await expect(page).toHaveURL(/\/libur$/);
});
