import { expect, test, type Page } from "@playwright/test";
import { frontCustomer, gameState, plantRecord, readRecord } from "./helpers";

async function startGame(page: Page) {
  await page.goto("/");
  await page.getByTestId("start-chapter-1").click();
  await expect(page).toHaveURL(/\/beranda$/);
}

/** The autosave batches ordinary changes, so wait until storage has caught up. */
async function waitForSaved(page: Page, check: (state: NonNullable<NonNullable<Awaited<ReturnType<typeof readRecord>>>["data"]> & object) => boolean) {
  await expect
    .poll(async () => {
      const record = await readRecord(page, "main");
      return record && typeof record.data === "object" && record.data ? check(record.data) : false;
    }, { timeout: 15_000 })
    .toBe(true);
}

test("a new game is saved at once", async ({ page }) => {
  await startGame(page);
  const record = await readRecord(page, "main");
  expect(record).not.toBeNull();
  expect(typeof record!.data === "object" && record!.data?.state?.phase).toBe("idle");
});

test("progress survives a reload, and the title offers to continue", async ({ page }) => {
  await startGame(page);
  await page.getByTestId("pre-tukar").click();
  await page.getByTestId("do-exchange").click();
  await waitForSaved(page, (d) => (d as { state?: { preOpenUsed: number } }).state?.preOpenUsed === 30);

  await page.reload();
  await expect(page).toHaveURL(/\/beranda$/); // reloading a game screen picks the save back up
  await expect(page.getByTestId("pre-open-left")).toContainText("90");

  await page.goto("/");
  await expect(page.getByTestId("continue-card")).toBeVisible();
  await expect(page.getByTestId("continue-info")).toContainText("Hari 1");
  await page.getByTestId("continue").click();
  await expect(page).toHaveURL(/\/beranda$/);
  expect((await gameState(page)).preOpenUsed).toBe(30);
});

test("a shift resumes where it stopped, paused, with the same customer", async ({ page }) => {
  await startGame(page);
  await page.getByTestId("open-warung").click();
  await expect(page).toHaveURL(/\/kasir$/);
  await expect.poll(async () => (await frontCustomer(page))?.id ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
  const before = (await frontCustomer(page))!;
  await waitForSaved(page, (d) => ((d as { state?: { line: Array<{ id: number }> } }).state?.line ?? []).some((c) => c.id === before.id));

  await page.reload();
  await expect(page).toHaveURL(/\/kasir$/);
  await expect.poll(async () => (await frontCustomer(page))?.id ?? 0).toBe(before.id);
  await expect(page.getByTestId("pause")).toHaveText("Lanjut"); // resumed paused, nothing runs away
  const clock = await page.getByTestId("clock").textContent();
  await page.waitForTimeout(2200);
  expect(await page.getByTestId("clock").textContent()).toBe(clock);
  await page.getByTestId("pause").click();
  await expect.poll(() => page.getByTestId("clock").textContent(), { timeout: 5000 }).not.toBe(clock);
});

test("phase changes are saved right away", async ({ page }) => {
  await startGame(page);
  await page.getByTestId("open-warung").click();
  await page.getByTestId("close-warung").click();
  await expect(page).toHaveURL(/\/ringkasan$/);
  await waitForSaved(page, (d) => (d as { state?: { phase: string } }).state?.phase === "ended");
  await page.reload();
  await expect(page).toHaveURL(/\/ringkasan$/);
  await expect(page.getByTestId("summary")).toBeVisible();
});

test("starting over asks first, then keeps the old save as a backup", async ({ page }) => {
  await startGame(page);
  await page.getByTestId("open-warung").click();
  await page.getByTestId("close-warung").click();
  await waitForSaved(page, (d) => (d as { state?: { phase: string } }).state?.phase === "ended");

  await page.goto("/");
  await expect(page.getByTestId("start-chapter-1")).toHaveText("Mulai baru");
  await page.getByTestId("start-chapter-1").click();
  await page.getByRole("button", { name: "Batal" }).click(); // changed my mind, the save stays
  expect((await readRecord(page, "main"))?.data).not.toBeNull();

  await page.getByTestId("start-chapter-1").click();
  await page.getByTestId("confirm-new").click();
  await expect(page).toHaveURL(/\/beranda$/);
  expect((await gameState(page)).phase).toBe("idle");
  const backup = await readRecord(page, "backup");
  expect(typeof backup?.data === "object" && backup?.data?.state?.phase).toBe("ended");
  const main = await readRecord(page, "main");
  expect(typeof main?.data === "object" && main?.data?.state?.phase).toBe("idle");
});

test("a damaged save is explained, not opened, and starting over keeps it as a backup", async ({ page }) => {
  await startGame(page);
  await plantRecord(page, "main", { format: 1, state: "nonsense" });
  await page.goto("/");
  await expect(page.getByTestId("save-problem")).toBeVisible();
  await expect(page.getByTestId("continue-card")).toHaveCount(0);
  await page.getByTestId("start-chapter-1").click();
  await page.getByTestId("confirm-new").click();
  await expect(page).toHaveURL(/\/beranda$/);
  const backup = await readRecord(page, "backup");
  expect(typeof backup?.data === "object" && backup?.data?.format).toBe(1);
});

test("a save from a newer version is left alone", async ({ page }) => {
  await startGame(page);
  await plantRecord(page, "main", { format: 99, anything: true });
  await page.goto("/");
  await expect(page.getByTestId("save-problem")).toContainText("lebih baru");
  await page.goto("/kasir"); // no usable save, so game routes go back to the title
  await expect(page).toHaveURL(/\/$/);
});
