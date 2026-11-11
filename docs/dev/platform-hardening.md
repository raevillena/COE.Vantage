# Platform hardening and sharing (2026-11-11, uncommitted)

One migration: `20260625000000_security_digest_share` (adds `User.emailDigest`, `Notification.emailedAt`, tables `LoginEvent` and `ScheduleShareLink`, and list indexes). Applied to the dev DB.

## 1. Email jobs survive restarts (grades access emails)
- The job state is in Redis (`gradeEmailJob:<subjectId>`, 7-day TTL), not in process memory (`gradeSubjectService.ts`). It holds the queue (`pendingIds`), so a restarted backend carries on where it stopped.
- A lock `gradeEmailLock:<subjectId>` (30 s, renewed after every email) says who is sending. On start and every 15 s `resumeAccessEmailJobs` takes over running jobs whose lock lapsed. A normal shutdown (SIGTERM/SIGINT) releases the locks at once (`releaseAccessEmailLocks`); a killed backend leaves the lock to lapse (up to 30 s plus the 15 s check). The page shows "paused" meanwhile.
- Several backend replicas are safe: only the lock holder sends. Verified by killing the backend during a 6-email job: it resumed and finished 6 of 6 with no repeats.

## 2. Notification email digest
- `modules/notifications/notificationDigest.ts`: every 30 min (Redis lock) emails each person their unread notifications that are older than 1 hour and not yet emailed, at most one email per person per 24 h, 50 emails per run. `Notification.emailedAt` marks the ones included. Per-user switch `User.emailDigest`. Profile page > Email notifications has a master switch ("Send me email notifications", sets both), "Remind me by email about college deadlines" (`User.emailDeadlines`) and "Email me a digest of notifications I have not read"; API `GET/PATCH /auth/me/email-preferences` `{digest?, deadlines?}` (the older `/auth/me/email-digest` still works). The bell is never switched off.
- OFF unless `EMAIL_DIGEST=true`. Keep it off in development: `backend/.env.local` has real Gmail settings. `utils/email.ts` never sends to `@coe.vantage` (the seed accounts) or to example.com / .test / .invalid addresses.
- INCIDENT 2026-11-11: a manual test run of `runDigestOnce()` (no user filter) handed digests for 341 real notifications of `@coe.vantage` users to the SMTP server before this guard existed. `emailedAt` was reset afterwards. `runDigestOnce(now, onlyUserIds)` now takes a user filter: use it in any test.

## 4. Login security
- `modules/auth/loginSecurity.ts`: 5 failed sign-ins per (email, IP) in 15 min lock that pair (HTTP 429, "Too many failed sign-in attempts"); 100 per IP. A correct sign-in clears the pair. Applies to password and Google. Redis down means no blocking.
- Every attempt is a `LoginEvent` row (90-day retention): `GET /auth/me/login-history` (own), `GET /auth/login-events?failures=1` (admin, no UI yet).
- Sessions: each sign-in has a session id (`sid` inside the refresh token, record `session:<sid>` in Redis). Profile page > "Where you are signed in": list, sign out one, sign out all others (`/auth/me/sessions`). Refresh fails for a signed-out session; an access token already issued works up to 15 minutes more.
- Not done: 2FA (TOTP). It needs a secret column, enrolment and recovery codes: separate work.

## 7. Schedule share links and calendar export
- `ScheduleShareLink` stores only a SHA-256 of the token. `POST /schedule-share {kind: FACULTY|CLASS, targetId, expiresInDays?}` returns the token and URLs ONCE; `GET /schedule-share` lists the caller's links, `DELETE /schedule-share/:id` turns one off. Faculty may share only their own schedule; staff roles any in their college; class links are staff only.
- Public, no sign-in, rate limited (120 / 15 min / IP): `GET /public/schedule/:token` (JSON) and `/calendar.ics`; page `/s/:token` (`pages/publicSchedule`, one card per day, phone friendly). The data is the college's CURRENT semester (the scheduling semester when it is not set) and follows changes.
- ICS (`utils/scheduleIcs.ts`): weekly `RRULE` for 18 weeks from the next occurrence of each weekday, Asia/Manila. Terms have no dates in the database, hence the fixed span.
- UI: "Share / calendar" button (`components/schedules/ShareScheduleDialog.tsx`) on Faculty schedule, Class schedule and the faculty dashboard.

## 10. Performance and operations
- Indexes: `User(collegeId,isDeleted,name)`, `Room(collegeId,isDeleted,name)`, `GradeRecord(subjectId,studentName)`, `FacultyLoad(academicYearId,semester,collegeId)`, `Notification(readAt,emailedAt,createdAt)`.
- Slow queries are logged as `[slow-query] Model.action took N ms` (`SLOW_QUERY_MS`, default 500, 0 = off; `prisma/client.ts`).
- `GET /health/ready` checks the database and Redis (503 when either is down); the k8s readiness probe uses it, liveness stays `/health`.
- NOT done: server-side paging for Users, Rooms, Trash and Grades records. The Users and Rooms pages derive their filter options and the duplicate-name check from the full list, and their sizes are one college's worth. Do it (the Subjects page is the pattern: `?page=` opt-in) if a list reaches many thousands.

## Tests
`loginSecurity.spec.ts`, `scheduleShare.spec.ts`, `healthReady.spec.ts`, `gradesEmails.spec.ts`. The digest rules were checked with a throwaway script (users `qa.digest.*@example.com`, deleted afterwards): waiting, opted out, read, too new, already emailed today. Restart-resume was checked by hand (kill and restart the backend during a job).
