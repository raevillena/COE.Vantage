# Hand-off (read this first)

Last refreshed: 2026-11-10. Refresh it at the end of every session (skill `end-session-handoff`). Keep it under about 70 lines: delete what is done.

## Where things stand
- Branch `main`, last commits `v0.8.0` and `v0.8.1` (the user committed both); v0.8.2 packaged 2026-11-10 and refreshed with Exam Room Reservation, not committed. **Uncommitted: only the list-filters work** (7 modified pages + `components/ui/listFilters.tsx` + `tests/e2e/listFilters.spec.ts` + a doc note). It is NOT in the v0.8.1 release notes; it belongs to the next release (when packaging, add one "Improved" line: filters on the Student classes, Subjects, Rooms, Curriculum, Departments and Trash pages; mention nothing admin-only beyond that).
- Dev servers (`:4000`, `:5173`) were started from a Claude session on 2026-11-10 (they stop when it ends: `npm run dev` in `backend/` and `frontend/`). **Uncommitted now (also the Portal Insert Grade rename with a rebuilt extension zip v0.2.1 and new guide pictures; also Exam Room Reservation + the faculty menu change, needs migration `20260624000000_exam_room_reservation`; the public lookup redesign; needs migration `20260623000000_grade_subject_sheet_url` in production when released; applied to the dev DB):** list filters, pagination, the Grades import link saved on the server, the Grades-table stutter change, Grades search/confirm dialog, the scheduler-test class fixture. When packaging the next release add "Improved" lines for filters and pages on the long lists (nothing admin-only beyond that).
- v0.8.2 needs two more migrations (`20260623000000_grade_subject_sheet_url`, `20260624000000_exam_room_reservation`); v0.8.1 needed two (the k8s migrate job runs them): `20260621000000_college_calendar_term`, `20260622000000_curriculum_specializations`. Both are applied to the dev DB. Images `raevillena21/coe-vantage-*:v0.8.1` must be pushed before applying manifests.

## What exists (notes live in `docs/dev/`, read only the one you need)
- **Exam Room Reservation** (new, unreleased; user-visible, so it BELONGS in the release notes as New): `docs/dev/exam-rooms.md`. The v0.8.2 packaging was put on hold before it; when releasing, add it and one more migration (`20260624000000_exam_room_reservation`), and mention the faculty menu groups (Management / Schedules).
- **Grades: Import emails + paced access-email sending + green check beside sent emails** (experimental, uncommitted, no migration, NOT for release notes): see end of `grades-module.md`. Dev backend has real Gmail SMTP in `backend/.env.local`; example.com-style addresses are never sent. Real SMTP was not exercised (ECONNRESET from this machine to Gmail).
- Grades module, Portal Insert Grade extension + access gate (v0.2.0) -> `grades-module.md`, `mmsu-grade-push.md`, `experimental-features.md` (per-user grants set by the admin on the Users page).
- Current vs Scheduling Semester (two terms per college; helpers `schedulingTerm`/`calendarTerm`) and the list-filter pieces -> `terms-users-search-nav.md` (last sections).
- Curriculum specializations (tags, class option, build page; a class with none takes every subject) -> `curriculum-and-subjects.md` (last section).
- Release-notes policy: experimental features and admin-only capabilities are never listed (skill `package-release`).

## Open items (most useful first)
1. **Scheduler smoke tests are green (2026-11-10):** the whole `smoke.spec.ts` passes (75 passed, 1 skipped). They create their own `QA CE 4A` class (`support.ts` `ensureCeClass`/`removeCeClass`) instead of using the user's `BS CE 4A`. Fixed along the way: a real bug in `AssignmentForm.tsx` (the "Checking room & faculty conflicts…" spinner stayed on and Save stayed disabled when the inputs became incomplete mid-check; the co-instructor check too), outdated selectors in the co-instructor test, and the Split marker (it shortens to "S" in narrow blocks). The split tests now use `actionTimeout: 15s` so a missing element fails on its own line. Not yet in the release notes (add a Fixed line when packaging: the conflict check no longer gets stuck on "Checking…").
2. **Pagination done (2026-11-10, uncommitted):** Subjects paged by the server, Users / Student classes / Rooms paged in the browser, Trash "Show more". See the last section of `docs/dev/terms-users-search-nav.md`. Not paged: Curriculum, Departments (small). If Rooms or Users ever reach many thousands, move them to server paging the same way as Subjects.
3. Colleges, Academic years and Scheduling rules have no filters (small by nature). The Grades subject list now has a text search (name, code, owner) next to the year/semester filters.
4. IUSIS / clipboard curriculum import cannot tag specializations (source has no such column); tags are set in the viewer or build page.
5. **Grades table scroll stutter: closed for now.** The user reports it only in their Chrome (smooth in the VS Code browser), so it is treated as a browser issue. The name + actions column is frozen again by default; "Freeze names" (checkbox, remembered) turns it off; the header row is one sticky element. See `docs/dev/grades-module.md`. Reopen only if the user raises it again (then: `chrome://gpu`, Incognito, the JS-mirrored top scrollbar strip).
6. `IT11 CE 2B` stores `4 -> PASSED`, `5 -> PASSED` (fix: Grading settings > Reset to MMSU Default > Save equivalence table > Compute grades) and has no term. Formula keys that are not columns still count as 0 out of 100 (`NSTP1 CPE 1C`: `Essay`, `Reflection paper 1`; `Math 34 CPE 1C`: `PS 1`). Both asked, not decided.
7. Grade column order is lost on import (jsonb). (Review leftovers done 2026-11-10: in-app confirm dialog instead of `window.confirm` on the Grades page, helper text at least 12px except the compact table badges, share select labelled.)
8. After deploying v0.8.1: check once on the real site that the Grade Push extension's login cookie reaches the API across the two hosts (only tested on localhost).

## This machine's state
- The admin account's experimental preferences were changed by test runs (Grades module on); the original value is unknown.
- College of Engineering terms are Scheduling = 1st Sem 2026-2027, Current = 1st Sem 2026-2027 (restored after an interrupted test; tests that change terms restore them in `finally`).
- A soft-deleted "Guest College 1794211252580" from a killed run remains in the colleges trash (no permanent-delete path found). The user's test data: curriculum "sample 2" with specialization "spez 2".
- `portal_*.txt` in the repo root hold real student data (git-ignored); the user should delete them when done.

## Gotchas
- Windows: stop the backend before `prisma generate`. Heredocs with quotes break in Git Bash (use the Write tool). Playwright wipes `tests/e2e/.results/` every run. A foreground command over ~120 s is killed and takes its test worker with it (leaves data behind): run long suites in the background.
- Do not run long tests in parallel with source edits: Vite reloads pages mid-test.
- The public lookup is rate limited (80 requests / 15 min / IP; restart the backend to clear).
- `position: sticky` only sticks to its nearest `overflow` ancestor (`<main>` is `overflow-auto` but the page scrolls).
- Naming trap: `College.currentAcademicYearId/currentSemester` and API `isActive`/`currentSemester` are the SCHEDULING semester; the Current Semester is `calendar*` / `isCalendar`.
