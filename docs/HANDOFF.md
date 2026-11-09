# Hand-off (read this first)

Last refreshed: 2026-11-09. Refresh it at the end of every session (skill `end-session-handoff`). Keep it under about 70 lines: delete what is done.

## Where things stand
- Branch `main`, last commit `v0.7.5`. **v0.8.1 is packaged (versions, changelog, k8s tags) but NOT committed**: dozens of modified and new files (see `git status`).
- Dev servers (`:4000` backend, `:5173` frontend) were NOT running at the start of the 2026-11-09 session; check and start them (`npm run dev` in each). Any started from a Claude session stop when it ends (logs `/tmp/backend.log`, `/tmp/frontend.log`).

## Built since v0.7.5 = v0.8.0 and v0.8.1 (all uncommitted; notes in `docs/dev/`)
- **Scheduler**: a ⋮ menu on each subject in the left list (edit details, possible rooms, possible faculty); the "Split" marker on blocks no longer gets clipped. Shared dialogs are in `frontend/src/components/subjects/`.
- **Student classes form**: the year level is read from the class name and a mismatch is warned about; year level and student count can be blank while typing.
- **MMSU Grade Push** (experimental, flag `mmsuGradePush`; v0.2.0 adds the Vantage access gate + logo, see `docs/dev/mmsu-grade-push.md`): browser extension in `frontend/extensions/mmsu-gradesheet/`, setup page at `/experimental/mmsu-grade-push`, zip in `frontend/public/downloads/`, screenshots in `frontend/public/guides/mmsu-grade-push/`. -> `docs/dev/mmsu-grade-push.md`.
- **Grades module** (`ExperimentalGradesPage`, `PublicGradesPage`, `docs/dev/grades-module.md`):
  - Fixed the undefined `bg-background` (see CLAUDE.md), compact wrapped score headers, a bounded table box with a pinned header and a top scrollbar, one frozen column, full student names.
  - Columns now follow the max-score row (a column exists once any record has a max or a score).
  - Grade-keys picker replaces the typed comma list. Import finds the header row in the first 20 rows (title rows above it are fine).
  - **MMSU defaults follow the portal** (2026-11-09): `4 -> CND`, `5 -> FAILED`, and the default passing percent is 50 (`DEFAULT_PASSING_PERCENT`), used by the example template, the settings dialog and the score-colour fallback. Test: `grades.spec.ts` "MMSU grade table defaults".
  - **INC for blank items** (2026-11-09): a blank formula item (a real column with no score) makes the computed grade INC with no number; entering 0 forces it. Server + preview + staff table + student page. Test: `grades.spec.ts` "INC for blank items". Existing stored grades are unchanged until "Compute grades" is run again (a read-only check said `CPE 180 3B` would become 26 of 27 INC, the other subjects far fewer).
  - **Terms**: subjects have an optional academic year + semester (migration `20260620000000_grade_subject_term`, **already applied to the dev DB**). Staff filters, header selects; the public page opens on the latest term, has year/semester filters, shows max per item and lists items with no score as "Missing".

- **Current vs Scheduling Semester** (2026-11-09, v0.8.1): see `docs/dev/terms-users-search-nav.md` (last section). New migration `20260621000000_college_calendar_term` (applied to the dev DB). Notifications and audit texts use the new names.

- **Curriculum specializations** (2026-11-09): migration `20260622000000_curriculum_specializations` (applied to the dev DB), curriculum viewer + manager UI, class option on the Student classes form and applied to the Scheduler tree, auto-schedule, GE import, dashboard progress and room requests. See the last section of `docs/dev/curriculum-and-subjects.md`.

## Before a release
- Apply the migration in production (the k8s migrate job does it). Rebuild the extension zip if `frontend/extensions/` changed (`npm run build:extension`) and bump its version in `manifest.json` and `EXTENSION_VERSION`.
- Changelog and version files were updated for v0.8.1 on 2026-11-09 (v0.8.0 was already deployed). Release notes deliberately leave out experimental features and admin-only capabilities. Remaining: commit, build and push the images, deploy (k8s migrate job runs the new migration).

## Open items (most useful first)
1. **Grades table horizontal scroll stutters in the user's Chrome, not in the VS Code pane.** Cause found: frozen cells cost a compositor layer per row; the frozen column only turns on at 1280px+, so VS Code's narrower pane probably never has it. Not reproduced in headless Chromium. Ask the user to try: narrow the window / zoom 125-150%, Incognito, `chrome://gpu`. Options: drop the frozen column, or freeze only at about 1920px. The top scrollbar strip is JS-synced and can lag the table by a frame. Details in the memory note `grades-table-stutter-redo`.
2. **`IT11 CE 2B` still stores `4 -> PASSED` and `5 -> PASSED`** (from the old default; the other 5 configured subjects are correct). Its bands equal the default, so "Reset to MMSU Default" + "Save equivalence table" + "Compute grades" in its Grading settings fixes it. Asked the user, not changed. Two subjects (`CPE 164 4B`, `cpe 180 3a`) have no grading system yet.
3. **Formula keys that are not columns still count as 0 out of 100** in the grade maths (`NSTP1 CPE 1C`: `Essay`, `Reflection paper 1`; `Math 34 CPE 1C`: `PS 1`), which lowers those students' grades. Not fixed. Options: remove the keys in Grading settings, or make the maths skip non-column keys. Asked the user.
4. The sheet's column order is lost on import (jsonb sorts keys); columns show formula order, then natural alphabetical. Idea: store the order at import.
5. `IT11 CE 2B` has no term set; students with only that subject see no term filters.
6. Smaller review leftovers: subject delete uses `window.confirm` while a single record needs a typed code; 10px helper text in the Grades page; the share dialog select has no label.
7. Optional cleanup: the old admin-Scheduler mentions in README, todo.txt and the v0.7.4 test.

## This machine's state
- The admin account's experimental preferences were changed by test runs (Grades module enabled); its original value is unknown.
- `portal_*.txt` in the repo root hold real student data (git-ignored); the user should delete them when done.
- The user set terms on 6 of 7 real grade subjects by hand.

## Gotchas
- Windows: stop the backend before `prisma generate`. Heredocs with quotes break in Git Bash. Playwright wipes `tests/e2e/.results/` on every run.
- The public lookup is rate limited to 80 requests / 15 min / IP (memory counter; restart the backend to clear).
- A `position: sticky` parent only sticks to its nearest `overflow` ancestor: `<main>` is `overflow-auto` but the page itself scrolls, so sticky strips inside it do not stick.
