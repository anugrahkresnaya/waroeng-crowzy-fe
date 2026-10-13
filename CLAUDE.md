# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Next.js 16.4 + React 19.3 + Tailwind 4 app for Warung Hidup (npm). It is the future `apps/web` from `../docs/PRD.md`. The code is still the create-next-app starter (`app/page.tsx`, `app/layout.tsx`).

## Commands

- `npm run dev`, `npm run build` (static export to `out/`), `npm run lint` (eslint), `npm run typecheck`
- `npm test` (Vitest: `engine/**` and `lib/**` tests), `npm run test:watch`
- Single test: `npx vitest run engine/counter.test.ts` or `npx vitest run -t "name"`
- `npx playwright test` runs the UI smoke tests in `e2e/` against `next dev -p 3100` using the installed Chrome (no browser download). Drive state in browser tests through the dev-only `window.__warung` hook (`{ store, content }`), never in production.
- Vitest output hides `console.log`; write probe output to a file if you need numbers from a run.

## App (`app/`, `components/`, `lib/`)

Static, client-only Next.js (`output: "export"`, `images.unoptimized`; `cacheComponents` is off because there is nothing server-side). Read `node_modules/next/dist/docs/` before changing Next config or routing.

- **State:** `lib/game-store.ts` (Zustand) owns one engine `Game` and an immutable `state` snapshot refreshed after every `send(command)` or `step()`. UI never mutates engine state; it only dispatches commands and renders the snapshot. `lib/counter-ui-store.ts` holds non-game counter state (the change being counted, the shelf tab).
- **Clock:** the kasir page calls `step()` once a second: 2 game minutes normally, 12 when `game.canFastForward()` (quiet hours, empty line). Pause is UI state in the store.
- **Routing guard:** `lib/use-guard.ts` sends a route to the screen that matches the game phase (`idle` is `/beranda`, `open` is `/kasir`, `ended` is `/ringkasan`); no game goes back to `/`. State is in memory only, so a reload returns to the title until saves exist.
- **Routes:** `/` title and settings, `(game)/beranda` pre-open (prepare, exchange cash, open), `(game)/kasir` live counter, `(game)/ringkasan` day summary with per-hour chart and low-change warning, `(game)/ponsel` placeholder. The `(game)` layout adds the tab bar and toasts.
- **Styling:** Tailwind 4. Semantic color tokens (`bg-bg`, `text-muted`, `border-line`, `bg-accent`, `text-good`...) are CSS variables in `app/globals.css` with light and dark sets, mapped via `@theme inline`. Game art colors are fixed in both themes. Use `!` as a suffix for important (`h-full!`).
- **Text:** react-i18next with `locales/id.json` and `locales/en.json` (`lib/i18n.ts`). Item and customer names come from engine content (`useLocalize`). `lib/locales.test.ts` checks both files match and that every key the code asks for exists, so add runtime-built keys to its list.
- **Input:** tap and drag both work through `data-drag="kind:id"` and `data-drop="zone"` handled by `components/kasir/drag-layer.tsx`.
- **Art:** `components/art.tsx` renders `public/assets` SVGs by manifest id with a plain `<img>`.

## Engine (`engine/`)

Framework-free, deterministic cashier-counter simulation. ESLint (`eslint.config.mjs`) blocks `react`/`next` imports, DOM globals, `Math.random`, `Date.now` and `new Date()` inside `engine/`. Randomness comes only from the seeded `Rng`; time is game minutes (`state.tick`).

- `Game` (`game.ts`) owns a plain-JSON `state`. `dispatch(command)` returns `{ok, events}` or `{ok:false, error}`; rejected commands must not change state. `tick()` advances one game minute while the warung is open. Accepted commands are logged with their tick, and `replay(content, seed, log)` rebuilds the run exactly. Saves are `game.snapshot()` as JSON and `Game.fromSnapshot`.
- `counter.ts` holds all cashier rules (arrivals, patience, cash/QRIS/kasbon, change, KTP check, prep). `money.ts` is the rupiah drawer and change-making; `clock.ts` the day parts.
- Content is JSON in `engine/content/` (items, customer types, balance numbers), validated by Zod in `schema.ts` at import. Items and customer types reference art by id (`art`), and a test checks each id exists in `public/assets/manifest.json`. Tune the game by editing JSON, not code.
- `engine/testing/` has a headless `playDay` bot and fixtures (`openGame`, `addCustomer`, `quietContent` with arrivals off) for scenario tests.
- Customer UI state is derived: use `moodOf(customer)` to pick the `<type>-<mood>` sprite.

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
