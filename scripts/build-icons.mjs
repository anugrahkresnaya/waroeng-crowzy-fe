// Draws the app icons from the game's own warung art. Needs Chrome (via Playwright): npm run icons
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const art = readFileSync(join(root, "public/assets/ui/warung-depan.svg")).toString("base64");
const src = `data:image/svg+xml;base64,${art}`;
const WALL = "#b9d1c5";

// "any": the awning and sign fill the square. "maskable": the same picture inside the safe zone.
const html = (size, scale, top) => `<body style="margin:0;background:${WALL};width:${size}px;height:${size}px;overflow:hidden;position:relative">
  <img src="${src}" style="position:absolute;width:${size * scale}px;left:${(size - size * scale) / 2}px;top:${top}px">
</body>`;

const OUT = [
  { file: "public/icons/icon-192.png", size: 192, scale: 1.9, top: 0 },
  { file: "public/icons/icon-512.png", size: 512, scale: 1.9, top: 0 },
  { file: "public/icons/icon-maskable-512.png", size: 512, scale: 1.45, top: 70 },
  { file: "app/icon.png", size: 512, scale: 1.9, top: 0 },
  { file: "app/apple-icon.png", size: 180, scale: 1.9, top: 0 },
];

mkdirSync(join(root, "public/icons"), { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
for (const { file, size, scale, top } of OUT) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size, scale, top));
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: join(root, file) });
  await page.close();
  console.log("wrote", file);
}
await browser.close();
