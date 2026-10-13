# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Next.js 16.4 + React 19.3 + Tailwind 4 app for Warung Hidup (npm). It is the future `apps/web` from `../docs/PRD.md`. The code is still the create-next-app starter (`app/page.tsx`, `app/layout.tsx`).

## Commands

- `npm run dev`, `npm run build`, `npm run start`, `npm run lint` (eslint)
- No test runner is configured yet. The PRD plans Vitest for the engine and Playwright for UI smoke tests.

## Gotchas

- This is not the Next.js in your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next code (see AGENTS.md above).

## Target design (PRD, not yet built)

- Static, client-only app: no server routes, no server-side features. A future API lives in `../warung-be`.
- The UI only renders and sends commands to a framework-free, deterministic simulation engine, and never holds game logic. Zustand subscribes to the engine store.
- Offline-first: saves in IndexedDB (Dexie), PWA via Serwist.
- Content (items, recipes, events, chapters, chat) is JSON validated with Zod. UI text goes through react-i18next (`id.json` / `en.json`), with no gameplay strings in components.
- The cashier counter is plain HTML/CSS with pointer events and supports both tap and drag. It must stay playable on a phone.
