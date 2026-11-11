<!-- Moved unchanged from dev.md (lines 1135-1297). Index: dev.md -->

### 35. End-to-end smoke tests (Playwright)

- `frontend/tests/e2e/smoke.spec.ts`, config `frontend/playwright.config.ts`; run `npm run test:e2e` in `frontend` against an already running local stack (backend :4000, frontend :5173, seeded DB; overrides `E2E_BASE_URL`, `E2E_API_URL`, `E2E_PASSWORD`). One browser, tests run in order.
- Covers: login changelog, chairman dashboard overview + drill-down + Faculty page (copy dialog, possible-subjects filters), admin Excel downloads and projection detail, secretary read-only UI and server-side 403s, faculty without the overview.
- Needs accounts `admin|dean|chairman|faculty1 @coe.vantage` (seed password `Test123!`) and `secretary@coe.vantage` with role COLLEGE_SECRETARY (create it from the Users page; it is not in the seed).
- Screenshots of failures go to `frontend/tests/e2e/.results/` (git-ignored). The suite reads data, except the Excel exports it only downloads; it creates nothing.

### 36. Repeat a block on other days

- Where: both ways of adding a block, the scheduler's assignment form (`AssignmentForm`, after dropping a subject) and the **Add load** modal (`AddFacultyLoadModal`). Not offered when editing a saved load. Shared logic lives in `components/scheduler/RepeatDays.tsx` (`useRepeatDays`).
- Behaviour: an "Also repeat on" row of Mon-Sat checkboxes (the block's own day is disabled). Ticking a day calls `POST /faculty-loads/preview` for that day with the block's faculty, subject, class, room and time; a day with a conflict is **not** ticked and the reason is shown next to it. Ticked days are re-checked automatically when anything in the block changes (and removed if the block's own day moves onto them); Save is blocked while one is checking or in conflict.
- Saving: the main block is created first, then one `POST /faculty-loads` per ticked day (client-side, no new endpoint). A cross-department faculty creates an approval request per day instead of a load. If a day fails on save, the toast lists which days were not saved and the rest stay saved.
- **Editing a saved block:** the same row appears with the block's other days ticked. A day counts as the same session when it has the same subject, class, faculty (or off-system name) and start/end time in that term. Those days show "saved"; unticking one marks it "will be removed when you update" and the button reads "Update (N day changes)". Ticking a new day runs the same conflict check (the block being edited is excluded so it cannot conflict with itself). On Update the block itself is PATCHed first, then new days are POSTed and removed days DELETEd one by one; failures are listed in the toast. Edits to faculty, room or time apply to the block being edited only, not to the other days.
- Limitation: not transactional; the server still re-checks every create, so a conflict that appears between the check and the save is rejected for that day only.
- Covered by the Playwright test "ticking a day checks for conflicts and saves one block per ticked day" (creates a Wednesday blocker through the API, expects Wed refused and Thu accepted, then removes everything it created).

### 37. Subject rooms for auto-assign, and the Subjects page default

- New table `SubjectRoom` (`subjectId`, `roomId`, unique together; migration `20260604000000_subject_rooms`; cascades with the subject or room). **No rows = unchanged behaviour**: auto-assign picks any room the department can use (its own rooms or rooms open for the term). Not per term: a room restriction describes the subject, not a semester.
- API: `GET /subjects/:id/rooms`, `PUT /subjects/:id/rooms` (`roomIds`; ADMIN or CHAIRMAN, a chairman only for subjects of their department). `GET /subjects` now includes `subjectRooms` (id + name) for the table.
- Auto-assign (`autoAssignForClass`): a subject with rooms may only use those, still intersected with the rooms the caller can use, class capacity and lab type. If none qualifies the subject is skipped with the reason "None of this subject's assigned rooms is available to you or fits the class". There is no random fallback for these subjects. Among several allowed rooms it picks the least-booked one, and does not retry another if that one has no free slot.
- The dashboard projection applies the same restriction when estimating room availability.
- Subjects page: a **Rooms** column ("Any", the room names, or "N rooms") and a row action **Set rooms for auto-assign** (searchable checklist, own department first). The page now opens on the most recently created curriculum (by `createdAt`) instead of all curricula, and the curriculum filter lists every curriculum, including ones with no subjects yet.

### 38. Reload buttons on the scheduler's bottom panels

- The **Room availability** and **Faculty schedule** panels each have a **Reload** button next to the title (`SchedulerPage`). Room availability re-runs `refreshRoomLoads` for the selected room; Faculty schedule uses the new `refreshOverlayFaculty` for the selected faculty. Each is disabled until a room / faculty is chosen and while loading (icon spins). Only these panels' data is refetched, not the main class grid, so unsaved work in the assignment form is untouched.
- Covered by two Playwright tests (a block added through the API appears after Reload).

### 39. Schedules pages: all departments for dean / secretary

- `schedules/faculty` and `schedules/student-class`: for ADMIN, DEAN, OFFICER and COLLEGE_SECRETARY the Department filter now defaults to **All departments** (it used to require picking one before any faculty or class appeared). Picking a department still narrows the list. A chairman keeps a fixed own-department scope (the server enforces it; the filter is hidden). In the all-departments view each faculty / class / room option carries the department code so same-named entries are distinguishable.
- The faculty list now includes deans (`DEAN`) as well as faculty and chairmen, since they carry teaching loads. Room availability already listed every room for everyone.
- Covered by Playwright tests (dean and secretary see a faculty member and a class from another department; a chairman does not).

### 40. Help tips: explanatory text as (?) icons

- Component `components/ui/helpTip.tsx` (`<HelpTip>text</HelpTip>`): a (?) icon button that shows a popover on hover, keyboard focus or click/tap, closes on Escape, blur or an outside click, and renders in a portal so dialogs and scroll areas never clip it (`role="tooltip"`, `aria-describedby`). Keep the text to a sentence or two in a neutral, professional register.
- Place the icon **next to** a heading or label, not inside it (`<div className="flex items-center gap-2"><h2>…</h2><HelpTip>…</HelpTip></div>`), so the heading's or field's accessible name stays clean.
- Converted: Reports (page, College Workload, faculty / class / room cards), Faculty (page and units), Rooms (section hints, open/closed, name, department), dashboard detail and projection, user form (email, initial password, max units), Curriculum (department scope and both IUSIS imports) and curriculum builder, Departments code naming, Profile sections, Requests, Scheduling rules, Scheduler assignment panel, prioritized-faculty dialog and the subject rooms dialog.
- Not converted on purpose: dialog `description` lines (standard dialog semantics), empty-state messages, and the experimental grade module screens.
- Covered by a Playwright test (hover, focus, click-to-pin, Escape, outside click).

### 41. Deloading, overload / underload, faculty dashboard, conflict scan

**Deloading**
- Table `FacultyDeloading` (migration `20260605000000_faculty_deloading`): items per person, academic year and semester, each with a description and units (decimals allowed). **Effective maximum = maximum units - sum of the term's items** (never below 0; no maximum means no judgement). Matches the registrar form: Regular Load = maximum less OA, "OA load eqv." = deloading total.
- API (`modules/deloadings`): `GET /deloadings?academicYearId&semester` (admin / dean / secretary: everyone; chairman: their department; anyone else: only themself), `PUT /deloadings/user/:userId` replaces one person's items for a term (ADMIN, or the CHAIRMAN of that person's department, which includes themself), `POST /deloadings/copy` copies a term's deloading to another for people who have none there. Dean, secretary and faculty are read-only.
- UI: `DeloadingDialog` (term pickers, items, effective maximum preview) opens from the **Faculty page** (chairman) and the **Users page** (admin). The Faculty page copy dialog can copy deloading together with possible subjects.
- `utils/deloading.ts` (`loadDeloadings`, `effectiveMaxUnits`, `loadState`) is the single source. It is used by the cap check on create / update of a load (error text states the maximum and deloading), auto-assign, the dashboard projection, the Excel workload form and the dashboard.

**Overload / underload**
- State per person: `over` (assigned > allowed), `under` (assigned < allowed, including 0 assigned), `full`, `unset` (no maximum set). Tolerance 0.05 units. Colours: red overload, amber underload, green full (`utils/loadState.ts`), used on the dashboard card, workload view and Faculty page.
- `dashboardWorkload.ts` `loadWorkloadRows` feeds the summary KPI (counts of overload / underload / full), the faculty-workload detail view (maximum, deloading, allowed, assigned, difference, status; filter by status) and a person's own view.
- New `TEACHING_ROLES` (`utils/teachingRoles.ts`): FACULTY, CHAIRMAN, DEAN and COLLEGE_SECRETARY can carry loads, appear in faculty lists and the scheduler, have a maximum and deloading, and count in these metrics.

**Faculty dashboard**
- `GET /dashboard/me` returns only the caller's own workload (no user id parameter), teaching totals and deloading items. A FACULTY user's dashboard (`FacultyDashboard`) shows that, their weekly schedule (from `/reports/faculty/:id/data`) and a link to downloads. Chairman, dean and secretary see a compact **My workload** card in the overview when they have a maximum or a load.

**Conflict scan**
- `dashboardConflicts.ts` scans the saved schedule of a term for overlaps on the same day: the same faculty, room or class in two loads. Rows of the same subject, class and time (co-instructors, split rooms) are one teaching event and do not count against the room or class. It is independent of the checks done when saving a block, so it catches approved cross-department requests, imports and direct edits. Shown as a dashboard card, an alert and the `conflicts` detail view (filter by type). Scope: a chairman sees conflicts of their department's faculty, rooms and classes.

### 42. Dashboard metrics export

- `GET /dashboard/export` (ADMIN, DEAN, CHAIRMAN, COLLEGE_SECRETARY; same scope as the dashboard, so a chairman exports only their department). Query: `academicYearId`, `semester`, `metric` = `all` (default) or one of `faculty-workload | room-utilization | curriculum-completion | scheduling-gaps | projection | conflicts`, `format` = `xlsx` (default) or `csv`, plus the detail-view filters (`q`, `state`, `type`, `reason`, `status`, `outcome`). CSV is for one metric only (UTF-8 with BOM, CRLF); `all` is a workbook: a **Summary** sheet (every KPI, the projection and the alerts) and one sheet per metric.
- `dashboardExport.ts` reuses `getDashboardAnalytics` without paging, so an exported table is exactly what the detail view lists, for the same filters. Numbers stay numeric in Excel; faculty rows get the same red / amber / green fills as the screen; sheets have a frozen header, filters and landscape fit-to-width.
- UI: **Export all metrics (Excel)** in the dashboard term overview, and **Export Excel / Export CSV** on each detail view (exports every matching row, not the visible page). Shared helper `utils/downloadFile.ts`.
- CORS now exposes `Content-Disposition` (`exposedHeaders`). Without it a browser on another origin could not read the server's file name and every download fell back to a generic name (this also applies to the Reports downloads).

### 43. Feedback / review page

- Sidebar link **Feedback** (bottom group, all roles including COLLEGE_SECRETARY; it is not scheduling data so `readOnly` does not apply). Route `/feedback` -> `pages/feedback/FeedbackPage.tsx`.
- Model `Feedback` (page, type BUG|CHANGE|IDEA, title, description, status NEW|PLANNED|DONE|DECLINED, adminNote, archivedAt) and `FeedbackImage` (mimeType, size, `data Bytes` = Postgres `bytea`). Migration `20260606000000_feedback`. Images live in their own table so list queries never load bytes.
- API (`modules/feedback`): `GET /feedback` (everyone sees everyone's, filters `status|type|page|q|archived=false|true|all`, newest first, 300 max), `POST /feedback` (multipart, field `images` up to 5 x 3 MB, PNG/JPEG/WebP checked by magic bytes, not by extension), `GET /feedback/:id`, `GET /feedback/images/:id` (bytes; the UI fetches it as a blob because the session is a bearer token, an `img src` cannot send it). ADMIN only: `PATCH /feedback/:id` (status, adminNote, archived), `DELETE /feedback/:id`, `DELETE /feedback/images/:id`, `DELETE /feedback/:id/images`, `GET /feedback/storage` and `DELETE /feedback/images?olderThanMonths=6&closedOnly=true`.
- Keeping the DB small: the browser resizes screenshots before upload (`utils/compressImage.ts`, max 1600 px, WebP). Admins have a **Picture storage** panel: total size, and a bulk delete of pictures older than N months (default 6), by default only for Done, Declined or archived items. Only the pictures are removed; the text, status and note stay. Deleted rows are reused by Postgres automatically (autovacuum); the file size on disk does not shrink unless a `VACUUM FULL` is run.
- Multer errors (file too big, too many files) are mapped to 400 in `errorHandler`.
- Deployment: the reverse proxy in front of the API must allow request bodies of about 20 MB (`client_max_body_size 20m;` in nginx, the default is 1 MB), see `k8s/nginx-vantage.conf`.

### 44. Faculty scope in schedules and reports (v0.3.7)

- A FACULTY user no longer has a Faculty schedule page (sidebar link and dashboard card hidden, route allows ADMIN, DEAN, CHAIRMAN, OFFICER, COLLEGE_SECRETARY only). Their own schedule is on the dashboard.
- New `GET /reports/my/classes` and `GET /reports/my/rooms` (`academicYearId`, `semester`): the classes and rooms where the caller has at least one block in that term. Class and Room schedule pages and the Reports page use them for a faculty member, and load the grid from `/reports/student-class/:id/data` and `/reports/room/:id/data` because `/faculty-loads`, `/student-classes` and `/rooms` stay closed to FACULTY.
- Report access (`reportController.ts`): faculty report and NOTA: ADMIN, DEAN, COLLEGE_SECRETARY any person; CHAIRMAN their own department (or themselves); FACULTY only themselves. Class report: staff all (chairman: classes of their department curricula); FACULTY only a class where they teach in that term. Room report: staff all; FACULTY only a room they use in that term. Anything else is 403.
- `GET /users` for a FACULTY caller returns only themselves (`listUsers(query, onlyId)`), so the Reports faculty dropdown shows just their name. The Reports page now asks for FACULTY, CHAIRMAN and DEAN so a chairman or dean can open their own report too.
- Faculty workload Excel (`reportExcel.ts`): deloading items are written beside the course rows, one item per row (description in OTHER ASSIGNMENT(S), units in OA load eqv.; extra rows are added when there are more items than courses), as in the registrar sample. Regular Load (maximum less deloading) is on the first row and the total row; the total row sums OA load eqv. People who have deloading but no saved load in the term are listed too (department scoped for a chairman).

### 45. Current term (default semester) (v0.3.7)

- `AcademicYear.currentSemester` (1, 2 or 3 = Mid Year, default 1; migration `20260607000000_current_semester`). With the existing single active academic year it is the **current term**.
- `PUT /academic-years/current-term` `{ academicYearId, semester }` (ADMIN and COLLEGE_SECRETARY): makes that year the active one and sets its semester. The Academic Years page has a "Current term" card for it; the college secretary can open the page (route and sidebar link) but sees no add, edit or delete.
- `utils/currentTerm.ts` returns the term filters open on (active year plus its `currentSemester`, or the first year on the 1st semester when none is active). Used by the dashboard, faculty dashboard, scheduler, schedules, rooms, faculty, reports, subjects (possible-subjects term) and users (prioritization and deloading). The schedule and report semester selects gained a Mid Year option so a current semester of 3 can be shown. Users can still pick another term in any filter.

### 46. Dark-mode pickers and time range warning (v0.3.7)

- `style.css` sets `color-scheme: light` on `:root` and `dark` on `:root.dark`, so native controls (time and date pickers, select lists, scrollbars) follow the theme app-wide.
- `components/scheduler/TimeRangeWarning.tsx` shows under the time inputs of the Assignment panel and the Add load dialog when the end is not after the start (usually 12:00 AM typed for 12:00 PM). It names both times in 12-hour form and offers "Set the end time to 12:00 PM" when the same clock time 12 hours later fits. It is a warning only; saving is still blocked by the existing validation.

### 47. Import GE schedule (v0.3.7)

- Scheduler toolbar **Import GE** (chairman only) opens a wide four-step modal (`components/scheduler/geImport/`): **Source** (class, then paste or file: .xlsx, .csv, .tsv, .txt), **Match subjects**, **Review and resolve**, **Done**. It imports one class at a time for the scheduler's current term (1st or 2nd semester; the load table does not take Mid Year).
- Backend `modules/geImport` (mounted at `/ge-import`, CHAIRMAN only): `POST /parse` (file or `{ text }`; `geParser.ts` finds the header row by "Course Code", tolerates the two-row header, blank separator rows, duplicate Course Title and No. of Units columns, quoted cells, carried-forward Program/Year/Section), `GET /class-subjects` (the class curriculum subjects for its year level and the semester, with required and scheduled minutes), `POST /preview` and `POST /save` (same checks; save repeats them in one transaction and creates all or nothing).
- Reading rules: a day string is split into days (`MWF` -> Mon, Wed, Fri; `TTh` -> Tue, Thu) and every day becomes one block. Times without AM or PM are read as 7-11 AM, 12 noon, 1-6 PM (`01:00-02:30` is 1:00-2:30 PM); the review step lets the user correct them. Rows whose faculty is "COE Faculty" are the college's own subjects and are skipped. Rows with no time, day or code are listed and left out.
- Matching: normalized course code (upper case, no spaces or punctuation) equals a class subject code; the rest are dragged (dnd-kit, `pointerWithin`) or chosen from the card's Match to list, or skipped. Several rows may go to one subject (lecture and lab of one code).
- Conflicts: **blocking** (must be fixed or the block skipped): overlap with a saved block of the class, overlap between imported blocks, end not after start, missing faculty or room text, subject not in the class curriculum, and a room that is one of ours and already in use. **Warnings** (reviewed with a checkbox): the same faculty name or room text possibly used elsewhere (saved blocks of other classes and within the import), a room too small, hours per week different from the subject requirement. Blocks identical to a saved one are "already scheduled" and skipped, so importing twice is safe.
- Saved blocks use off-system faculty (`facultyDisplayName`, `facultyId` null). A room whose text equals one of the college rooms (ignoring case and punctuation) and that the chairman may assign becomes that room (`roomId`), so real room conflicts apply; otherwise it stays as `roomDisplayName`.
- JSON body limit raised to 1 MB for pasted tables. Sample sheets: `GE subjects.txt` and the CSV in the repository root (the parser test reads them).

### 48. Split a repeated subject (v0.3.7)

- Adding a co-instructor to a saved block now offers "Also add the co-instructor on" with the block's saved repeat days (same subject, class, faculty and time), all ticked. Each day is checked (team peer of that day's block) and created; a day that fails is reported and the rest still go in. `useRepeatDays` now returns `existing` (day -> saved block id).
- "Split Class" starts on the first day, after the edited block's, where the class has no overlapping block at the same time, with the same faculty and room ready to confirm. The stale copy of the edited block no longer fills the new form (`assignmentInitialValues` uses `editingLoad` only while `editingLoadId` is set). `PendingAssignment` gained `facultyDisplayName` and `roomDisplayName`.

### 49. College GE sheet, secretary rights (v0.3.8)

- Model `GeOfferingSet` (one per academic year and semester 1 or 2; `rows` = the parsed `GeRow` list as JSON, `rowCount`, `sourceName`, `uploadedByName`); migration `20260608000000_ge_offering_sets`. Uploading a sheet for a term replaces the one saved before.
- API under `/ge-import`: `GET /college?academicYearId&semester` (CHAIRMAN, COLLEGE_SECRETARY, ADMIN, DEAN) returns `{ exists: false }` or `{ exists, set, rows, groups, warnings }`; `PUT /college` (COLLEGE_SECRETARY, ADMIN; multipart `file` or JSON `text`, plus `academicYearId` and `semester`) parses with `parseSource` and saves; `DELETE /college`. `POST /parse` is open to CHAIRMAN, COLLEGE_SECRETARY and ADMIN; class-subjects, preview and save stay CHAIRMAN only.
- Page `/ge-subjects` (sidebar GE subjects for the college secretary and the admin): year and semester filters (default: the current term), saved-sheet status with remove, add or replace by paste or file (Check the sheet, then Save with a replace confirmation), and the saved rows with program and text filters.
- Import GE modal (scheduler): step 1 now chooses the source: **College GE schedule** (default when the term has one, with who added it and when) or **Custom** (paste or file, as before). Everything after step 1 is the same. Every step opens scrolled to the top of the dialog.
- Academic years: `POST /academic-years` and `PATCH /academic-years/:id` also allow COLLEGE_SECRETARY (create, rename, set active). Trash, restore and permanent delete stay ADMIN. The page hides selection and trash for the college secretary.
- Scheduling rules: the routes allow COLLEGE_SECRETARY and the service treats it like ADMIN (`isCollegeWide`): sees all rule sets, creates global ones, sets and removes assignments. Page `/admin/scheduling-rules` (title now "Scheduling rules") and a sidebar link for the college secretary.

### 50. Assignment panel day and time lock (fix, v0.3.9)

- Cause: picking a faculty makes the scheduler suggest a free slot and write it into the pending block (`pendingAssignment` gets a day and times), which becomes `liveTime` for the form. The form's sync effect listed its own `dayOfWeek`, `startTime` and `endTime` as dependencies, so any edit made in the form was compared with the pending block and undone, and the day stayed on the suggestion (usually Monday) until the block was saved and edited.
- Fix: the effect now depends only on `liveTime`, so only a change of the block on the grid (drag, resize, suggestion) moves the form. Edits made in the form go to the block through the new `onTimeChange` prop (day select, time inputs and the end-time quick fix), which also marks the block as placed so the scheduler stops suggesting slots. Covered by the "assignment panel day and time" e2e test.

### 51. Split Class vs team teaching (v0.3.9)

- **Team teaching** (co-instructor): another instructor for the same subject, class, day and exact time, same room allowed; unchanged, not labelled.
- **Split Class** (the button on a saved block): the class is shared with a **different instructor**. It opens at the same day, time and room with no instructor chosen and a note; the time may be changed. A block is a split when it is created with `splitOfLoadId` (the block it splits); the API refuses the same instructor (400, `assertValidSplitSource`), requires the same subject, class and term, sets `FacultyLoad.isSplit` (migration `20260609000000_load_split`) on the new block and on the original instructor's blocks of that subject (all repeat days).
- Conflicts: faculty and room conflicts apply as always (a split in the same room at an overlapping but different time is refused). The student-class check ignores overlaps with the sibling blocks of the same subject (`isSplit` or the split source), nothing else: another subject at that time is still a clash. Updating a split keeps the rule (`existing.isSplit`); the dashboard conflict scan skips pairs of split blocks of one subject and class.
- The label: grid blocks show a "Split" tag (all schedule views) and the tooltip; `copyClassSchedule` carries the flag. Deleting blocks until only one instructor is left clears the label.
- Repeat days work with a split: every ticked day is created with the same `splitOfLoadId`.

### 52. Lecture and laboratory units (v0.4.0)

- `Subject` has `lecUnits` and `labUnits` (migration `20260610000000_subject_components`, backfilled: `isLab` rows become all lab units, the rest all lecture units). `units` stays the total (the curriculum checklist figure) and `isLab` now means a **laboratory-only** subject (no lecture units), the only kind that needs a laboratory room, so the room rules, auto-assign room choice and lab-break logic are unchanged.
- One formula: weekly hours of blocks = faculty load credit = `lecUnits + 3 * labUnits` (`creditedLoadUnits` in `utils/workload.ts`; `requiredMinutesForSubject` is that times 60). 3 lec + 1 lab = 6. Callers pass the subject (selects include `lecUnits` and `labUnits`): max-units cap, auto-assign, dashboard progress and projection, GE import, Excel workload report.
- API: subjects create and update take `lecUnits` and `labUnits`, or the older `units` + `isLab` (all lecture or all laboratory); `resolveSubjectUnits` computes the stored fields. The curriculum apply-import also accepts `lecUnits` and `labUnits` per row.
- Frontend: `utils/subjectUnits.ts` (`lecUnitsOf`, `labUnitsOf`, `weeklyHours`, `unitsLabel`, `componentTag`) falls back to units + isLab for records without the split. Subjects form and list, the curriculum review and viewer tables, and the scheduler subject tree (required hours, "Lec/Lab" tag) use it. Blocks are not typed: a subject's hours are split over blocks freely.

### 53. Notification bell (v0.4.1)

- Table `Notification` (userId, type, title, body, link, groupKey, count, readAt, updatedAt) and `User.lastSeenVersion` (migration `20260611000000_notifications`). Routes `/notifications` (list with unread count, `read-all`, `seen-version`, `:id/read`, `DELETE :id`), every role, rows are always the caller's own.
- Sending: `notifyUsers` / `notifyScheduleChange` in `modules/notifications/notificationService.ts`. Best effort (errors are logged, never thrown) and called with `void` after the action. `exceptUserId` keeps people from being told about their own action. A `groupKey` folds events into the open unread row for 15 minutes (`count`, title as a function of the count). Read rows older than 90 days are deleted when their owner lists.
- Hooks: load create/update/delete in `facultyLoadController` (it knows the actor), auto-assign (per faculty, `increment`), request create/approve/reject, feedback create/update, `setCurrentTerm`, `saveCollegeSet`, deloading replace, `maxUnits` change in `updateUser`. Not hooked: GE import blocks (faculty are off-system text), copy schedule, reset.
- Releases need no rows: the bell compares `CHANGELOG` with `lastSeenVersion` (a user who never looked sees only the latest). Opening it shows the release notes and stores the version.
- Frontend: `components/layout/NotificationBell.tsx` in the app bar (Radix dropdown, polls every 60 s and on tab focus); `ChangelogDialog` can be controlled (`open`, `onOpenChange`, `showTrigger`).
- Instant updates would need a push channel. With 2 backend replicas: Server-Sent Events plus Postgres LISTEN/NOTIFY so every replica hears every event, and `proxy_buffering off` with a long read timeout on the nginx API proxy.

### 54. Semester lock

- Table `TermLock` (academicYearId, semester, lockedByName, lockedAt; unique per term; migration `20260612000000_term_lock`). `PUT /academic-years/:id/term-lock {semester, locked}` for ADMIN, DEAN and COLLEGE_SECRETARY; `GET /academic-years` (and `/for-schedules`) return `termLocks` per year. The dean gets the Academic years page and a sidebar link, with the lock buttons only.
- `assertTermUnlocked(academicYearId, semester)` in `utils/termLock.ts` is called before every write that belongs to a term: faculty load create, update (old and new term), delete, reset, auto-assign, copy (target term), GE import save, cross-department request create and approve, deloading replace and copy (target term), room open/close. It applies to everyone, so even an admin unlocks first. Not guarded: rejecting a request, possible subjects per term, scheduling rule assignments, the college GE sheet.
- Locking or unlocking notifies chairmen and faculty (type `TERM_LOCK`). Frontend: `utils/termLock.ts` (`findTermLock`), lock chips and confirm dialog on `AcademicYearsPage`, banner plus disabled actions and drag in `SchedulerPage`.

### 55. Audit log (v0.5.0)

- Table `AuditLog` (migration `20260613000000_audit_log`): actor snapshot (`actorName`, `actorEmail`, `actorRole`, `actorDepartmentId`; `actorId` has **no foreign key**), `entityType`, `entityId`, `entityLabel` (name at the time), `action`, `summary`, `changes` (`{ field: { from, to } }`), optional term. A Postgres trigger raises on UPDATE and DELETE, so entries can only be appended (a database owner can still drop the trigger). There are no write routes.
- The actor comes from `utils/auditContext.ts` (AsyncLocalStorage set in the `authenticate` middleware), so services record who acted without being passed the user. `audit()` is best effort; `audited(spec, run)` reads the record before and after, diffs the fields and records once `run` succeeded. Secrets (`passwordHash`, `experimentalFeatures`) and timestamps are never copied.
- Recorded: academic years (all, plus `SET_CURRENT_TERM`, `LOCK`, `UNLOCK`), curriculum (and import), subjects, student classes (create, delete, restore only), departments, rooms (and `OPEN`/`CLOSE` per term, transfer), users (role, status, department, max units), scheduling rules and assignments, the college GE sheet, deloading, and schedule blocks: create and delete in `facultyLoadController`, reset, auto-assign, copy and GE import as one summary entry each. Not recorded: block edits and moves, logins, faculty activity, feedback, notifications.
- API `/audit` (list, `export.csv`, `kinds`) for ADMIN, DEAN and COLLEGE_SECRETARY only. Frontend: `components/audit/AuditList.tsx` (filters, paging, details, CSV), `HistoryButton.tsx` (shown only to those roles, on the page headers), `pages/audit/AuditLogPage.tsx` and a sidebar link.

### Split Class update (2026-11-11, uncommitted): groups, same instructor allowed
- The "different instructor" rule is gone. A split is a set of **numbered groups** (`FacultyLoad.splitGroup`, migration `20260629000000_split_group`, which numbers existing splits one group per instructor). The block being split becomes group 1 and each new split block starts the next group, whoever teaches it. The same instructor may teach several groups at different times; at the same time it is a faculty clash (400 / "Faculty has another class at this time").
- Hours: `scheduledMinutes` takes the hours of ONE group (the biggest), keyed by `splitGroup` (rows without one still count per instructor). Deleting blocks removes the Split label when fewer than two groups remain (`deleteFacultyLoad`).
- Tests: `smoke.spec.ts` "split rules" and "splitting a repeated subject", `splitHours.spec.ts`.
