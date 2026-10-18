# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Next.js 16.4 + React 19.3 + Tailwind 4 app for Warung Hidup (npm). It is the future `apps/web` from `../docs/PRD.md`. Phases 1 and 2 are built (counter, market and menu) and phase 3 is partly built (batch kitchen and the cooking mini game); see the sections below.

## Commands

- `npm run dev`, `npm run build` (static export to `out/`, then `serwist build` writes `out/sw.js` with the precache list), `npm run preview` (serves `out/` on :3200 with clean URLs), `npm run lint`, `npm run typecheck` (app and `sw/`)
- `npm test` (Vitest: `engine/**` and `lib/**` tests), `npm run test:watch`
- Single test: `npx vitest run engine/counter.test.ts` or `npx vitest run -t "name"`
- `npx playwright test` runs the UI smoke tests in `e2e/` against `next dev -p 3100` (override with `E2E_PORT`, e.g. `E2E_PORT=3000` to reuse a dev server that is already running) using the installed Chrome (no browser download). Drive state in browser tests through the dev-only `window.__warung` hook (`{ store, content }`), never in production.
- `npm run test:pwa` builds, serves `out/`, and tests the production build: manifest, icons, and playing with the network off (`e2e-pwa/`). `npm run icons` redraws the app icons from the game art.
- Vitest output hides `console.log`; write probe output to a file if you need numbers from a run.

## App (`app/`, `components/`, `lib/`)

Static, client-only Next.js (`output: "export"`, `images.unoptimized`; `cacheComponents` is off because there is nothing server-side). Read `node_modules/next/dist/docs/` before changing Next config or routing.

- **State:** `lib/game-store.ts` (Zustand) owns one engine `Game` and an immutable `state` snapshot refreshed after every `send(command)` or `step()`. UI never mutates engine state; it only dispatches commands and renders the snapshot. `lib/counter-ui-store.ts` holds non-game counter state (the change being counted, the shelf tab).
- **Clock:** the kasir page calls `step()` once a second: 2 game minutes normally, 12 when `game.canFastForward()` (quiet hours, empty line). Pause is UI state in the store.
- **Routing guard:** `lib/use-guard.ts` sends a route to the screen that matches the game phase (`HOME[phase]`). With no game in memory it first tries to resume the save (paused), and only goes back to `/` if there is none. Every game screen must use `useGuard`, never its own redirect, or a reload races the save load.
- **Saves:** `engine/save.ts` defines the save envelope (`format`, seed, start day, command log, state), validates it with Zod, migrates old formats (`MIGRATIONS`, bump `SAVE_FORMAT` when the shape changes; format 1 predates the market and is reported as `outdated`, not opened), and `reconcile()` repairs a save against changed content (removed items, customer types, invalid day-off plans). `lib/save-db.ts` stores it in IndexedDB through Dexie: slot `main` is the current game, `backup` is what a new game replaced; unreadable or newer saves are kept, never deleted. `lib/autosave.ts` writes on a new game or a phase change at once and batches other changes every 4 s, plus on tab hide. Settings (language, theme) are in localStorage, not the save.
- **Offline / PWA:** `app/manifest.ts`, generated icons, and `sw/sw.ts` (Serwist) precache the whole export; the worker is registered in production only (`components/providers.tsx`) and a new version waits until all tabs close so a shift is never swapped mid-play. Pages are visited as `/kasir` but exported as `kasir.html`, hence `cleanURLs`.
- **Routes:** `/` title and settings; `(game)/beranda` pre-open (prepare, exchange cash, open); `kasir` live counter; `ringkasan` day summary; `malam` free time; `besok` the "open tomorrow?" question; `libur` the day-off hub; `jadwal` the weekly planner (asked on Sunday night); `ponsel` the phone (apps: `pasar` market, `bank`, `berita` radio news, `jadwal`; ojol/chat/buku kas/layanan are placeholders); `menu` prices, portions and cost per portion; `gudang` storeroom, spoilage and what you can no longer make; `dapur` the kitchen (cook batches ahead). The summary page also holds the leftovers card. `HOME[phase]` in `lib/use-guard.ts` maps each phase to its route. The `(game)` layout adds the tab bar and toasts.
- **Styling:** Tailwind 4. Semantic color tokens (`bg-bg`, `text-muted`, `border-line`, `bg-accent`, `text-good`...) are CSS variables in `app/globals.css` with light and dark sets, mapped via `@theme inline`. Game art colors are fixed in both themes. Use `!` as a suffix for important (`h-full!`).
- **Text:** react-i18next with `locales/id.json` and `locales/en.json` (`lib/i18n.ts`). Item and customer names come from engine content (`useLocalize`). `lib/locales.test.ts` checks both files match and that every key the code asks for exists, so add runtime-built keys to its list.
- **Layout, desktop later:** the app is phone-first in one column (`components/phone-frame.tsx` floats it as a 430px card on large screens). A two-pane desktop shell is planned (PRD: two columns on desktop), so keep every screen self-contained: render inside whatever width it is given, no full-screen or tab-bar-dependent layout, and navigate with plain links so a pane can host it.
- **Input:** tap and drag both work through `data-drag="kind:id"` and `data-drop="zone"` handled by `components/kasir/drag-layer.tsx`.
- **Art:** `components/art.tsx` renders `public/assets` SVGs by manifest id with a plain `<img>`.

## Engine (`engine/`)

Framework-free, deterministic cashier-counter simulation. ESLint (`eslint.config.mjs`) blocks `react`/`next` imports, DOM globals, `Math.random`, `Date.now` and `new Date()` inside `engine/`. Randomness comes only from the seeded `Rng`; time is game minutes (`state.tick`).

- `Game` (`game.ts`) owns a plain-JSON `state`. `dispatch(command)` returns `{ok, events}` or `{ok:false, error}`; rejected commands must not change state. `tick()` advances one game minute while the warung is open. Accepted commands are logged with their tick, and `replay(content, seed, log)` rebuilds the run exactly. Saves are `game.snapshot()` as JSON and `Game.fromSnapshot`.
- **Phases and the day flow:** `idle` (pre-open, work day) → `open` (live shop) → `ended` (summary) → `night` (free time 22.00–24.00) → `bed` ("open tomorrow?") → `nextDay` → `idle` or `dayoff`. A day off is `dayoff` (four blocks run with `runBlock`) → `night`. Time only ticks in `open`; everywhere else commands move the clock. `workDays[7]` is the weekly plan (max 2 off, `setPlan`), `offPlan` holds each day-off block (`setBlock`: one heavy or up to two light activities), and Sunday night `planConfirmed` resets so the plan is asked again. Closing on a planned work day costs reputation (`unplannedClosure`). `mood` and `hunger` (0 to 100, hunger higher is hungrier) change with blocks, free time and the day's customers; they do not affect play yet. There is no energy meter.
- `counter.ts` holds all cashier rules (arrivals, patience, cash/QRIS/kasbon, change, KTP check, prep). `money.ts` is the rupiah drawer and change-making; `clock.ts` the day parts.
- Content is JSON in `engine/content/` (items, customer types, balance numbers), validated by Zod in `schema.ts` at import. Items and customer types reference art by id (`art`), and a test checks each id exists in `public/assets/manifest.json`. Tune the game by editing JSON, not code.
- `engine/testing/` has a headless `playDay` bot and fixtures (`openGame`, `addCustomer`, `quietContent` with arrivals off) for scenario tests.
- Customer UI state is derived: use `moodOf(customer)` to pick the `<type>-<mood>` sprite.

## Market (`engine/market.ts`)

- Products are keyed by ingredient id, or `g-<itemId>` for resale goods. Price = base × season × event × (1 + mean-reverting noise); events have lead days so `berita` can warn first. `advanceMarketDay` runs in `nextDay`.
- Supplier orders: cutoff 20.00 gives next-day delivery, later waits one more day; express costs more; a late roll happens once at first due (flood adds `lateBoost`). `deliverDue` runs on day advance and day-off blocks. A pasar trip (planned `ke-pasar` in a day-off block) buys at market price with no supplier, stock arriving at once.
- Pantry is FIFO lots with `unitCost` (feeds COGS), spoilage by shelf life, and the small fridge holds the oldest lots. Items are `dish` (recipe in base units, portion multiplier, reputation per portion) or `good` (stock pieces, average cost); `sellOut` consumes stock and returns COGS.
- Money is split between `bank` and the drawer; only big notes move between them. Commands refused by the market must leave state untouched, including `state.rng` (see the pasar-trip rollback); `engine/invariants.test.ts` fuzzes this.

## Kitchen (`engine/kitchen.ts`)

- A dish with `batch` in `items.json` (gorengan, nasi bungkus, es teh) is cooked ahead with `cookBatch` onto `state.display` (batches with `cookedAt`, `unitCost`) and sold from there. Other dishes still cook to order from the pantry. `portionsLeft` and `sellOut` branch on `item.batch`.
- Before opening a batch costs minutes from the same `preOpenMinutes` block as preparing the shelves (90), so only a few fit; food is ready at opening time. While open it blocks the counter (`busyUntil`) and needs `shelfReady`.
- `sweepDisplay` (each tick) throws out batches older than `freshMinutes`, counted in `stats.waste`; `clearDisplay` empties it on `nextDay`. At night `handleLeftover` per dish: obral (cash into the drawer), eat (hunger), give (reputation, capped), trash.
- Tests that need cook-to-order behavior use `quietContent` (batches stripped); `kitchenContent` keeps them. Saves went to format 3 with a migration from 2.

## Cooking to order (`engine/cooking.ts`)

- Dishes with `cook` in `items.json` (Indomie, kopi, telur) go on one of `balance.burners` burners with `startCook` (manual or auto) and come off with `plate`. Burners run on game ticks, so the result depends only on the tick the command was logged at and replays exactly. Plating inside `cook.minutes ± (window + practice)` is `pas`, earlier `kurang`, later `gosong`; auto-cook takes `autoMul` times as long and always gives `biasa`.
- Ingredients are used when the dish goes on, the plated portion sits in `customer.cooked` (quality and cost) and on the tray, and a customer who leaves or declines wastes both the stove and the tray portion. `pick` refuses a cooked dish (`needs_cooking`). Sales add the stored cost to COGS and apply `balance.cooking.rep`; a `kurang`/`gosong` plate makes the customer annoyed.
- `state.skill[item]` counts perfect plates; every `practicePerMinute` of them widens the window by a minute, up to `maxPractice`.
- The UI is `components/kasir/stove.tsx` inside the ordering panel. The clock runs 2 game minutes per second, so the bar moves in 2-minute steps. Browser tests pause the clock and use `advanceMinutes` from `e2e/helpers.ts`. `quietContent` strips `cook` too, so scenario tests need no stove. Save format 4.

## Gas (`engine/gas.ts`)

- LPG is a pantry ingredient (`lpg`, 1 tank = 1000 flames) that dishes burn per portion. `gasShort` makes `startCook` and `cookBatch` fail with `out_of_gas` (not `out_of_stock` / `missing_ingredients`) when gas is the lack.
- `buyGas` buys one tank next door: `balance.gas.nearbyMarkup` times the market price, paid from the bank, in the pantry at once. It costs `nearbyMinutes` of pre-open time, or blocks the counter (`busyUntil`) while open. No new saved state.
- UI: a gas card on `/dapur`, and a gas line with a buy button in the stove panel when below 0.1 tank. The live counter has no link to `/dapur`, so anything needed mid-service must live on the counter itself.

## Power, token and bills (`engine/outage.ts`, `engine/bills.ts`)

- Power is out when `powerOff(state)`: a PLN cut (`plnOff`) or an empty electricity token (`tokenEmpty`, the player's own doing). Ice, the fridge and arrivals all read `powerOff`.
- **PLN cut:** `state.outage` is one cut: `day`, start minute `from`, `hours` (capped at midnight), `known` (announced) and `ice`. `rollOutage` runs in `nextDay` after spoilage: a passed cut is cleared, and if none is pending one may be rolled from `balance.outage.fromDay` on. With notice it is set for tomorrow and announced (`outage_notice`); without, it hits today. `tickPower` emits `power_out` / `power_back`. `state.lantern` is owned for good.
- **Token:** `state.token` is credit in rupiah. `tickToken` burns `token.openPerMinute` each open minute (not during a PLN cut), `tokenNewDay` burns `perDay` overnight, and `token_low` fires once on crossing `lowMark`. At zero `token_out` fires mid-service. `buyToken` takes a pack from `token.packs` plus `fee` from the bank and works in any phase. `tokenOffMinutes` counts open minutes with an empty token, plus `overnightMinutes` if it is empty at bedtime.
- **Effects of no power:** no dish that uses `es-batu` can be cooked without ice (`no_ice`); from `darkFrom` arrivals drop to `lantern.darkMul`, or `lanternMul` with a lantern (`arrivalMul`). If a PLN cut outlasts `fridgeHoldHours` (plus `ice.holdHours` with ice), or the token was off that long, `spoilOvernight` ages fridge lots at room-temperature life that night and the morning report shows the loss.
- `buyIce` (only on the cut's day) and `buyLantern` are errands: pre-open minutes, a blocked counter while open, free at night. Paid from the bank.
- **Bills:** `balance.bills` (rent `kontrakan` for now); `state.bills[id].dueDay`. `tickBills` (in `nextDay`) announces a bill `noticeDays` ahead and on the day, and once past `grace` days costs `rep` reputation every night. `payBill` is allowed from `noticeDays` before the due date, adds `lateFee` once overdue, and moves the due date on by `everyDays`. Nothing worse than a fee and reputation happens yet (no eviction or game over; that is a design decision).
- UI: `components/outage-banner.tsx` (in the `(game)` layout) shows the token warning and the PLN cut with their buy buttons; the bank app has the token and bills cards. Bots use `payUp` in `engine/testing/bot.ts`. Save format 6.
- Balance note: the bot earns roughly Rp300k a day, so rent (Rp600k per 30 days) and the token (about Rp12k a day) are cheap. Tune before relying on bills as pressure.
- Not built yet (PRD): phone battery and mobile data, QRIS failing, selling pantry stock cheaply in a cut, helping a neighbour, generator, freezer, the chapter 2 scripted first cut, and the other v0.1 consequences (repossession, eviction, pinjol).

## Gotchas

- This is not the Next.js in your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next code (see AGENTS.md above).

## Assets

- Visuals are flat 2D SVG (no Three.js). The 128 assets live in `public/assets/{barang,uang,pelanggan,ui,ponsel,aplikasi,bahan}/` with `manifest.json`. `bahan` holds the 25 ingredients and supplies from the PRD price table, ids `bahan-<name>` (e.g. `bahan-cabai`, `bahan-lpg`); resale goods from the PRD (medicine, household, toiletries) are not drawn yet. `ponsel` holds the phone frame (screen cut out so HTML sits behind it), signal/battery/data status icons, app icons and chat avatars; `aplikasi` holds in-app glyphs for bank, ojol and market.
- They are generated: edit `scripts/build-assets.mjs` and run `node scripts/build-assets.mjs`, which wipes and rewrites `public/assets/`. Do not hand-edit the SVG files.
- Style: flat fills, one ink outline (2.5), details as 2-unit strokes, palette defined in the script's `COLORS`. Reference assets by the manifest `id` from content JSON.
- Customers come as `<type>-<happy|neutral|annoyed>`; swap the sprite as patience drops.

## Target design (PRD, not yet built)

- Static, client-only app: no server routes, no server-side features. A future API lives in `../warung-be`.
- The UI only renders and sends commands to a framework-free, deterministic simulation engine, and never holds game logic. Zustand subscribes to the engine store.
- Offline-first: saves in IndexedDB (Dexie), PWA via Serwist.
- Content (items, recipes, events, chapters, chat) is JSON validated with Zod. UI text goes through react-i18next (`id.json` / `en.json`), with no gameplay strings in components.
- The cashier counter is plain HTML/CSS with pointer events and supports both tap and drag. It must stay playable on a phone.
