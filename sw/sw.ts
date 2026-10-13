/// <reference lib="webworker" />
// Precaches the whole static export so the game loads and plays with no network.
// `serwist build` (see serwist.config.mjs) bundles this file and injects the file list.
import { Serwist, type PrecacheEntry } from "serwist";

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: Array<PrecacheEntry | string> };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Pages are exported as kasir.html but visited as /kasir.
  precacheOptions: { cleanupOutdatedCaches: true, cleanURLs: true },
  // A new version waits until every tab is closed, so a game in progress never swaps its files mid-shift.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
});

serwist.addEventListeners();
