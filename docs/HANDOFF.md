# Hand-off (read this first)

Last refreshed: 2026-11-11. Refresh it at the end of every session (skill `end-session-handoff`). Keep it under about 70 lines: delete what is done.

## Where things stand
- Branch `main`, last commit `v0.8.2`; **v0.9.0 packaged 2026-11-11, not committed** (everything since v0.8.2 is uncommitted: the Scheduler fixes, Google sign-in, the platform pass, college deadlines, email preferences, and the Grades Reload / Import emails work). New backend dependency `google-auth-library`: rebuild the backend image. `tsc` passes in both packages; the full suite passed (130) before the deadlines work, and the new specs pass.
- Dev servers (`:4000`, `:5173`) were restarted 2026-11-11 from a Claude session (hidden windows; they stop when the machine/session ends: `npm run dev` in `backend/` and `frontend/`).
- **Deploying v0.9.0:** push images `raevillena21/coe-vantage-*:v0.9.0` (the k8s files already point at them), run the migrations (the k8s migrate job does): `20260623000000_grade_subject_sheet_url`, `20260624000000_exam_room_reservation`, `20260625000000_security_digest_share`, `20260626000000_college_deadlines`, `20260627000000_email_deadlines_pref` (all applied to the dev DB). In the deployment config set `GOOGLE_CLIENT_ID` (Google sign-in) and `EMAIL_DIGEST=true` (digest and deadline reminder emails), and check `TRUST_PROXY`. Without them the Google button and the emails stay off.

## Built since v0.8.2 (all in the v0.9.0 package unless marked experimental)
- **Block length barrier (user-visible: add one "Fixed" line when packaging the next release):** end time must be after start. Server `assertPositiveLength` in `facultyLoadService.ts` (create, update, preview -> 400); forms `AssignmentForm` and `AddFacultyLoadModal` disable Save / Check conflicts; `ScheduleSlotOverlay` draws a red stub for a bad pending range (not checked in a browser). Not checked: whether old bad blocks exist in the DB (my read-only script failed on college scope).
- **Grades Reload button** (above the table, next to "Showing X of Y") and a line in "Send access emails" saying how many have an email / were already emailed / would be sent. Experimental: NOT for release notes.

- **Scheduler: department filter for the admin's Student class picker** (user-visible, admin-only: do NOT list in release notes). `SchedulerPage.tsx` (`classDepartmentId`, shown when classes span 2+ departments); test `schedulerClassDepartment.spec.ts`. Only the class picker; the Faculty picker has no department filter yet.
- **Split hours (user-visible fix: add a "Fixed" line when packaging):** a split subject's hours are those of ONE group, so moving a split block to another time no longer counts as extra hours. Helper `scheduledMinutes` (`backend/src/utils` and a copy in `frontend/src/utils`) used by the curriculum tree label, `autoAssignForClass` and `dashboardProgress.ts`. Test `splitHours.spec.ts` (pure function; not checked by clicking in the browser). Rule chosen: both groups take the full hours; a class with only split blocks shows the larger group's hours.
- **No repeat days on an already-split block** (user-visible; fold into the split-hours Fixed/Improved line): `AssignmentForm` prop `isSplitBlock` (from `editingLoad.isSplit` in `SchedulerPage`) hides the repeat picker for a saved split block and shows a note. Creating a split still allows repeat days. Test `splitNoRepeat.spec.ts`.
- **Scheduler layout:** the Assignment panel is ~25% narrower at 2xl (`SchedulerLayout` grid in `SchedulerPage.tsx`: 2.5fr / 6.25fr / 3.75fr, was 2.5 / 5 / 5; the panel keeps a 22rem minimum). Below 2xl (xl) the panel sits under the timetable and is unchanged. Checked by screenshot at 1700 px only.
- **Drop keeps its place** (user-visible fix: add a "Fixed" line when packaging): a subject dropped on the Scheduler grid now starts the assignment on the DROPPED day and time (one hour), not on Monday via the first-free-slot search (`handleDragEnd` in `SchedulerPage.tsx`). Test `dropDay.spec.ts`. Login tests now use `{ name: "Sign in", exact: true }` because the Google button adds another "Sign in" button.
- **College deadlines + reminders** (user-visible, a good release headline: "Deadlines page with reminders"; details `docs/dev/college-deadlines.md`; needs migrations `20260626000000_college_deadlines` and `20260627000000_email_deadlines_pref` in production, applied to dev): the college secretary adds deadlines, the whole college reads them, reminders by bell (always) and email (needs `EMAIL_DIGEST=true`) at 7/3/1 days before, 8:00 AM Manila by default, configurable per deadline. Not done: copy deadlines from last term, test-reminder button, recurring.
- **Platform pass 2026-11-11** (details `docs/dev/platform-hardening.md`; needs migration `20260625000000_security_digest_share` in production, applied to dev; both new migrations go into the k8s migrate job): persistent email jobs (Redis), notification email digest (OFF unless `EMAIL_DIGEST=true`), login lockout + sessions + login history (Profile page), schedule share links + ICS + public page `/s/:token`, indexes + readiness probe + slow-query log. User-visible, for the next release notes: share/calendar links, sign out other devices, login protection, digest emails (not the admin events endpoint). NOT done: 2FA, server paging for Users/Rooms/Trash/Grades.
- **Google sign-in (user-visible: add a "New" line when packaging, without naming admin things):** existing `@mmsu.edu.ph` accounts only, see `docs/dev/forms-theme-auth.md`. OFF until `GOOGLE_CLIENT_ID` is set (needs a Google Cloud OAuth Web client with the site origins as authorized JavaScript origins). Real Google token flow untested.

## What exists (notes in `docs/dev/`, read only the one you need)
- Exam Room Reservation + faculty menu -> `exam-rooms.md`. Grades module, Import emails, paced sending, Portal Insert Grade extension -> `grades-module.md`, `mmsu-grade-push.md`, `experimental-features.md`.
- Current vs Scheduling Semester, list filters, pagination -> `terms-users-search-nav.md`. Curriculum specializations -> `curriculum-and-subjects.md`.
- Release-notes policy: experimental features and admin-only capabilities are never listed (skill `package-release`).
- Email: `utils/email.ts` has one pooled transport; reserved example domains are logged, never sent. `backend/.env.local` holds REAL Gmail SMTP settings, so the dev backend really sends to real addresses.

## Open items (most useful first)
0b. **Planned, not built:** exams / quizzes / assignments with Safe Exam Browser (experimental). Plan and six OPEN decisions in `docs/dev/assessments-seb-plan.md`; ask the user to answer them before starting.
0. **Google sign-in setup:** the user must create the OAuth client id, put it in `backend/.env.local` (dev) and the k8s config, then try one real mmsu.edu.ph login on localhost and on the live site.
1. **Email progress "3/4 then 5/5" (user report 2026-11-10):** could not reproduce; a probe with 5 students showed 2/5, 3/5, 4/5, 5/5 with a fixed total. Ask the user for the exact text and whether it was "all" or "selected". Likely cause is that only some students have an email or were not yet emailed (the new summary line explains it).
2. **Real SMTP never exercised:** ECONNRESET from this machine to smtp.gmail.com:587. Test one real address on the real deployment before a bulk send.
3. IUSIS / clipboard curriculum import cannot tag specializations (no source column); tags are set in the viewer or build page.
4. `IT11 CE 2B` stores `4 -> PASSED`, `5 -> PASSED` (fix: Grading settings > Reset to MMSU Default > Save equivalence table > Compute grades) and has no term. Formula keys that are not columns count as 0 out of 100. Both asked, not decided.
5. Grade column order is lost on import (jsonb). Server paging only for Subjects (Rooms/Users/Trash are paged in the browser).
6. Grades table scroll stutter: closed (only the user's Chrome; names frozen by default, "Freeze names" checkbox). Reopen only if raised again.
7. After deploying: check the extension's login cookie reaches the API across the two hosts (only tested on localhost).

## This machine's state
- Incident 2026-11-11: a test run of the digest handed digests for 341 real notifications of `@coe.vantage` users to the SMTP server (undeliverable; expect bounce mails in the inbox of coeMailService@gmail.com). Flags reset; `@coe.vantage` is now never sent.
- The admin account's experimental preferences were changed by test runs (Grades module on); original value unknown.
- College of Engineering terms: Scheduling = Current = 1st Sem 2026-2027. A soft-deleted "Guest College 1794211252580" remains in the colleges trash. The user's data: curriculum "sample 2" with specialization "spez 2"; a leftover Dean user `audit1793238048656@coe.vantage`.
- `portal_*.txt` and `GE subjects.txt` in the repo root may hold real student data (git-ignored); the user should delete them.

## Gotchas
- Windows: stop the backend before `prisma generate`. Heredocs with quotes break in Git Bash (use the Write tool). Playwright wipes `tests/e2e/.results/` every run. A foreground command over ~120 s is killed and takes its test worker with it: run long suites in the background. Do not edit sources while tests run.
- The public lookup is rate limited (80 requests / 15 min / IP; restart the backend to clear).
- `tsx` scripts in `backend/scripts` need the college scope; a bare `PrismaClient` query failed.
- Naming trap: `College.currentAcademicYearId/currentSemester` and API `isActive`/`currentSemester` are the SCHEDULING semester; the Current Semester is `calendar*` / `isCalendar`.
