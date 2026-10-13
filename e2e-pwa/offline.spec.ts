import { expect, test, type Page } from "@playwright/test";

/** Waits until the service worker has installed and taken control, so the whole game is cached. */
async function cached(page: Page) {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
}

test("the web manifest describes an installable app, and its icons exist", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: "Warung Hidup", display: "standalone", start_url: "/" });
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
});

test("after one visit the game loads and plays with the network off", async ({ page, context }) => {
  await cached(page);
  await context.setOffline(true);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Warung Hidup" })).toBeVisible();

  await page.getByTestId("start-chapter-1").click();
  await expect(page).toHaveURL(/\/beranda$/);
  await page.getByTestId("open-warung").click();
  await expect(page).toHaveURL(/\/kasir$/);
  await expect(page.getByTestId("stage")).toBeVisible();
  // the art is cached too: the stage backdrop and the open sign actually decoded
  await expect
    .poll(() => page.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0)))
    .toBe(true);

  await page.getByTestId("close-warung").click();
  await expect(page).toHaveURL(/\/ringkasan$/);
  await expect(page.getByTestId("summary")).toBeVisible();
});

test("offline, a reload on a game screen resumes the save and opening a page by address works", async ({ page, context }) => {
  await cached(page);
  await page.getByTestId("start-chapter-1").click();
  await page.getByTestId("open-warung").click();
  await page.getByTestId("close-warung").click();
  await expect(page).toHaveURL(/\/ringkasan$/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string | null>((resolve) => {
            const open = indexedDB.open("warung");
            open.onsuccess = () => {
              const get = open.result.transaction("saves").objectStore("saves").get("main");
              get.onsuccess = () => resolve(get.result?.data?.state?.phase ?? null);
            };
          }),
      ),
    )
    .toBe("ended");

  await context.setOffline(true);
  await page.goto("/malam"); // a different page, by address, with no network: phase 'ended' sends it to the summary
  await expect(page).toHaveURL(/\/ringkasan$/);
  await expect(page.getByTestId("summary")).toBeVisible();
});

test("pages that do not exist still get the offline-safe 404", async ({ page }) => {
  const response = await page.goto("/nope");
  expect(response?.status()).toBe(404);
});
