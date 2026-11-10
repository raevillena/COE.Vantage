---
name: rebuild-mmsu-extension
description: Use whenever any file under frontend/extensions/mmsu-gradesheet/ changes, or the Portal Insert Grade page or its screenshots need updating. Rebuilds the extension, bumps versions, refreshes the committed download zip and the guide pictures.
---

# Rebuild the Portal Insert Grade extension

The extension lives in `frontend/extensions/mmsu-gradesheet/` (`src/*.ts`, `manifest.json`). The download zip `frontend/public/downloads/vantage-mmsu-grade-push.zip` is **committed** and served by the app. `npm run build` does **not** rebuild it, and the frontend Dockerfile only copies `src` and `public`, so a stale zip means users download an old extension.

## Steps (run in `frontend/`)
1. Edit the extension source.
2. Bump `version` in `extensions/mmsu-gradesheet/manifest.json` **and** `EXTENSION_VERSION` in `src/pages/experimental/ExperimentalMmsuGradePushPage.tsx` (keep them equal).
3. `npm run build:extension` - type-checks, bundles with esbuild into `extensions/mmsu-gradesheet/dist` (git-ignored) and rewrites the zip (fixed timestamps, so identical sources give identical bytes).
4. `npx playwright test tests/e2e/mmsuPush.spec.ts` - loads the built extension into Chromium against a fake portal. Needs no backend or frontend running. It also rebuilds the zip as a side effect.
5. If the panel's look or the steps changed, regenerate the guide pictures: `MMSU_SCREENSHOTS=1 npx playwright test tests/e2e/mmsuPush.spec.ts -g screenshots` (writes `public/guides/mmsu-grade-push/*.png`; made-up students only). Look at them before keeping them.
6. Tell the user the zip changed and must be committed with the source. Do not commit unless asked.

## Rules that keep it safe
- The extension never talks to the real portal in tests: every request the fake portal does not answer is aborted and fails the test. A tab opened by the extension cannot be intercepted, so test that action by stubbing `chrome.tabs.create`, never by opening it.
- Match students by student number only; never fall back to a name. Never touch the portal's Remove or Reset buttons.
- Real-markup facts (form action, grade dropdown values, Save button name) are in `docs/dev/mmsu-grade-push.md`.
