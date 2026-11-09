<!-- Moved unchanged from dev.md (lines 1001-1134). Index: dev.md -->

### 25. Split schedule / team teaching — UI design (minimal, opt-in)

**Context**

- Most assignments stay **single**: one subject, one class, one faculty, one slot — this must remain the default path with **no extra clicks**.
- A **minority** of cases need either (a) **same slot, multiple faculty** (team teaching), or (b) **same subject + class, different times** (split sessions).

**Principles**

1. **Default unchanged** — Drag subject → `PendingAssignment` / `AssignmentForm` behaves as today (single load). No new required fields on the happy path.
2. **Opt-in only** — Split/team is behind a **secondary, explicit control** so choosing it is intentional, e.g.:
   - A **tertiary text link or small button** in the assignment panel: “Add co-instructor (same time)” or “Split into another session…” — not a prominent tab or first-class mode switch.
   - Or: **overflow / “More”** menu on the assignment form with those actions.
3. **No mode chooser up front** — Avoid asking “Single vs Team vs Split” when the user picks a subject; that would disrupt the majority flow.
4. **Progressive disclosure** — After the user saves a **normal** assignment, optional actions appear: “Duplicate slot for another faculty” (team) or “Add another meeting time for this subject” (split), only where product rules allow.

**Concrete minimal UI options (pick one when implementing)**

- **Team (same time):** User completes one assignment as today → clicks **“Add co-instructor (same time)”** → form opens with day/time/room/subject/class **read-only**, user picks only **additional faculty(ies)** → batch create matching `FacultyLoad` rows.
- **Split (different times):** User completes first block as today → **“Add another session for this subject & class”** → new pending state with subject + class pre-filled, user picks time/room/faculty as usual (second placement on grid or form).

**Backend note**

- Multiple `FacultyLoad` rows already support this; optional future `splitGroupId` only if grouping in the grid/list is required.
- **Implemented:** `POST /faculty-loads` accepts optional `excludeLoadId` for same-slot co-instructor creates; the server checks that the excluded row matches the same slot and a different faculty, then passes `excludeLoadId` into conflict detection so room/class checks ignore the sibling load.
- **Grid:** Loads that share the same slot (same class, subject, day, start/end; room may differ) are **one layout unit** for lane assignment, so adding a co-instructor no longer forces the whole day column into multiple narrow strips. Co-instructors render **side-by-side inside that one slot** (`ScheduleGrid.tsx`).
- **Conflicts:** Preview/create/update use `checkConflicts`; overlapping loads with the **same** class+subject+time (room may differ) are treated as **team teaching** and do **not** set student-class conflicts against each other. Room conflicts are evaluated per proposed room. `excludeLoadId` on create still only needs the anchor row to match subject, class, and time — co-instructor may use another room.
- **Co-instructor UI:** The add co-instructor dialog includes **Room (co-instructor)**, defaulting from the assignment being edited but editable to another in-system or off-system room.
- **Instructor search:** Assignment form instructor pickers (including co-instructor search) load both `FACULTY` and `CHAIRMAN` roles, so chairmen are selectable as instructors.
- **Scheduler lists:** Scheduler faculty datasets now use `/users` filtered to `FACULTY` + `CHAIRMAN` (instead of `/users?role=FACULTY`) in `AssignmentForm`, `SchedulerPage`, `AddFacultyLoadModal`, and `FacultySchedulePage` to keep instructor search/options consistent.

---

### 26. Schedule read access + department-scoped filters

**Issue observed**

- `OFFICER` could open `FacultySchedulePage` / `StudentSchedulePage` but could not load faculty/classes because backend read routes still excluded OFFICER.
- Admin/Dean/Officer class dropdown showed all classes; requested behavior is department-scoped selection first, while Chairman remains department-scoped automatically.

**Backend changes**

- `facultyLoadRoutes`: read access now includes `OFFICER` (`authorize("ADMIN", "DEAN", "CHAIRMAN", "OFFICER")` on router-level auth). Write endpoints stay Chairman-only.
- `studentClassRoutes`: read stack now includes `OFFICER`.
- `userRoutes` list gate: non-admin faculty-only listing (`?role=FACULTY`) now allows `OFFICER` alongside `CHAIRMAN`/`DEAN`/`FACULTY`.
- `studentClassService.listStudentClasses` now accepts optional `{ departmentId }`:
  - `CHAIRMAN` still forced to own department (query ignored).
  - `ADMIN`/`DEAN`/`OFFICER` can filter classes by `departmentId`.
- `studentClassController.list` reads optional `departmentId` query and forwards it to service.

**Frontend changes**

- `StudentSchedulePage`:
  - Added Department selector for `ADMIN`/`DEAN`/`OFFICER`.
  - Class list fetches from `/student-classes?departmentId=...` only after department is selected.
  - Chairman flow unchanged (classes already scoped by backend to own department).
- `FacultySchedulePage`:
  - Added Department selector for `ADMIN`/`DEAN`/`OFFICER`.
  - Faculty list fetches with `/users?role=FACULTY&departmentId=...` after department is selected.
  - Chairman flow remains unchanged.

**Verification**

- Backend `tsc --noEmit`: pass.
- Frontend `npm run build`: pass.

---

### 27. Workload credit: lab units count 3x (faculty load and max units)

- Single source of truth: `backend/src/utils/workload.ts` → `creditedLoadUnits(units, isLab)` (lab = units × 3, lecture = units).
- Used by `getLoadedUnitsByFaculty`, `getFacultyUnitsWith` (max-units check on create/update), auto-assign (cap check and running totals) and `dashboardService`.
- A subject taught to the same class on several days still counts once per faculty. **Student-facing units are never multiplied** (class schedule export shows the real units).
- `requiredMinutesForSubject` (lab 3 h/unit/week) is unchanged; it is the curriculum-hours rule, separate from workload credit.

### 28. Chairman / dean as faculty

- Faculty page (`ChairmanFacultyPage`) lists `FACULTY` + `CHAIRMAN` of the chairman's department (`role` array query; backend defaults to the same for chairmen). Chairman row is tagged; its edit dialog locks the role and changes only status / max units.
- `updateUser`: a chairman may edit department FACULTY or **themselves** (still limited to `status` and `maxUnits`). Controller passes the caller `id`.
- `autoAssignForClass` candidate pool is `FACULTY | CHAIRMAN | DEAN` (not deleted); the existing same-department rule still applies, so only a chairman/dean in the subject's department is picked.
- `setPrioritizedFaculty` accepts the same three roles.
- Possible-subjects picker has a **Curriculum** filter (curricula derived from the subject pool). Subjects page has a curriculum filter (all / a curriculum / no curriculum). No schema change.
- `status` is free text (no fixed list).

### 29. Cross-department approval when editing a load's faculty

- `PATCH /faculty-loads/:id` (`facultyLoadController.update`): when a CHAIRMAN changes `facultyId` to a faculty in a different department than the subject/curriculum, it creates a `CrossDepartmentLoadRequest` (HTTP 202, `{ requestCreated: true }`) instead of saving. The existing load is untouched until approval.
- New nullable column `CrossDepartmentLoadRequest.replacesLoadId` (migration `20260601000000_request_replaces_load`; run `npx prisma migrate deploy`). `approveRequest` deletes the replaced load and creates the new one in one transaction. Reject leaves the original load.
- Frontend: `AssignmentForm` and the scheduler's conflict-resolve action read `requestCreated` and toast accordingly.

### 30. Official Excel exports (class schedules, faculty workload)

- Code: `backend/src/modules/reports/reportExcel.ts`; handlers in `reportController.ts`; routes `GET /reports/export/class-schedules` and `GET /reports/export/faculty-workloads` (query `academicYearId`, `semester` 1–3, optional `id` = class / faculty). ADMIN, DEAN, CHAIRMAN only; a chairman is scoped to their own department's classes / faculty. The older `college-workload` export was removed in v0.3.5; these two forms replace it, under the "College Workload" card at the top of the Reports page.
- Layout follows the registrar sample (form URO-FRM-012B header, College / Semester block). One sheet each: classes stacked with a yellow "Total Units" row; faculty grouped under a department band.
- Meetings of one subject are folded into one row via `buildMeetingSegments`: meetings sharing time + room are one segment with its own day letters (M T W Th F Sa), segments joined by " / ". Units total counts each course once.
- Faculty columns: `# of Units` = real units; `Actual Load` = credited units (lab ×3); `Regular Load` = the faculty's `maxUnits`; `Over load` = max(0, actual − regular). `OA load eqv.` and `Other assignments` are blank (no data). Status text sits beside the first course row.
- Class title is `<class> (<curriculum name>)`; a bare 4-digit curriculum name becomes "<year> CURRICULUM".
- Frontend: Reports page "Official forms (Excel)" with busy state, server filename, and API error text for blob responses.

### 31. Dashboard overview (phase 1)

- `GET /dashboard/summary?academicYearId&semester` (`modules/dashboard`), ADMIN / DEAN / CHAIRMAN. Chairman is scoped to their department's classes, faculty and rooms; no caching by design.
- KPIs: curriculum scheduled % (required hours via `requiredMinutesForSubject`, co-instructor duplicates counted once, capped at required), faculty load used % (credited units vs `maxUnits`, over / near-90% counts), room use % (Mon–Sat 07:00–19:00 window, each booking once), scheduling gaps (unscheduled + partial class subjects).
- Projection is an estimate: remaining hours for subjects that have at least one prioritized faculty vs. those that do not. Room and conflict limits are not simulated. Top 3 alerts are ranked by severity; links go to the relevant page.
- Frontend: `DashboardOverview.tsx` above the navigation cards. KPI cards and alerts link to the detail views below (they carry the selected term in the URL). The pending-requests alert links to `/requests`.
- **Phase 2 (detail views):** `GET /dashboard/analytics?metric=faculty-workload|room-utilization|curriculum-completion|scheduling-gaps` with `academicYearId`, `semester`, `page`, `pageSize` (max 100), `q`, and per-metric filters (`state`, `status`, `reason`); validated with zod, same role scope as the summary. Page: `/dashboard/details/:metric` (`DashboardDetailPage.tsx`), filters and page live in the URL.
- Shared rules (do not duplicate): `dashboardProgress.ts` → `loadCurriculumProgress` (required vs scheduled minutes per class subject, co-instructor slots counted once, capped at required) and `loadRoomUtilization` (per-room booked minutes inside the Mon–Sat 7:00–19:00 window); `creditedUnitsByFaculty` in `dashboardService.ts`. The summary and the detail views both use them, so a number and its breakdown always agree.
- **Phase 3 (constraint-aware projection, estimate):** `dashboardProjection.ts` → `simulateProjection`, computed inside the same summary request (no extra API call; about 70 ms on the local dataset). Per unscheduled class subject, in class/subject order with greedy reservations: faculty must be listed for the subject, in the subject's department (auto-assign cannot cross departments) and have unit cap left (credited units, lab 3x; partly scheduled subjects already carry their units); rooms must belong to the class's department or be open for the term, fit the class size, be a lab for lab subjects, and have enough free hours in the Mon-Sat 7-19 window. Outcomes: `schedulable | no-faculty | faculty-cap | no-room | no-room-hours`. It does **not** search real time slots, so real auto-assign can place less; the UI says so. Nothing is persisted.
- Surfaces: projection panel breakdown on the dashboard, a "may not fit current limits" alert, and detail view `metric=projection` (filter `outcome`, including `blocked`).
- Not built: phase 4 (trends; needs retained historical data). Optional later: short-lived cache keyed by department + term if the simulation ever becomes slow on a larger dataset.

### 32. Changelog on the login page

- Release notes live in `frontend/src/data/changelog.ts` (newest first; kinds `new | improved | fixed`) and are mirrored in `CHANGELOG.md` at the repo root. Frontend cannot import the root file (the Docker build context is `frontend/`), so update both when releasing.
- `AuthLayout` shows a **What's new** link beside the version when `showChangelog` is set (enabled on the login page only); it opens `ChangelogDialog`, which marks the entry matching `VITE_APP_VERSION` as current.
- Release checklist: add the entry, bump `VITE_APP_VERSION` in `frontend/.env.production`, tag the images.
- Entries before v0.3.0 were reconstructed from git history; v0.2.0 and v0.2.2 are best-effort labels (the commits only tagged v0.2.1 and v0.2.3).

### 33. Possible subjects to teach are per term

- `SubjectFacultyPriority` now has `academicYearId` + `semester` (migration `20260602000000_priority_per_term`; unique on subject + faculty + year + semester). The migration copies existing rows to the active academic year for semesters 1 and 2, then deletes the legacy rows without a term (kept untouched if no year is active; legacy rows are ignored by the app).
- API: `GET /subjects/:id/prioritized-faculty?academicYearId&semester`, `PUT` body includes `academicYearId` + `semester` (replaces that term's list only), `GET /users/:id/prioritized-subjects?academicYearId&semester`, and `POST /subjects/prioritized-faculty/copy` (`from*` / `to*` term, optional `facultyIds`; never overwrites rows already in the target; a chairman copies only their department's faculty).
- Consumers filter by term: auto-assign (`autoAssignForClass`), `loadCurriculumProgress` (eligible faculty) and the dashboard projection.
- Faculty page: the dialog edits the term selected at the top of the page, with an "Offered: This semester / All semesters" filter (uses `Subject.semester`; null counts as every semester), a native curriculum filter, and a "Copy possible subjects from another term" action. Subjects page: the prioritized-faculty dialog has its own academic year / semester pickers (defaults to the active year and the subject's semester). Users page viewer also takes a term.
- Not touched: `Subject.semester` (the curriculum's recommended semester) is a different thing from this per-term assignment.

### 34. COLLEGE_SECRETARY role (read-only, college-wide)

- New `Role.COLLEGE_SECRETARY` (migration `20260603000000_add_college_secretary_role`, `ALTER TYPE ... ADD VALUE`). Not tied to a department: every scope branch in the services only narrows for `CHAIRMAN`, so the secretary gets college-wide data like the dean.
- Rule: **view everything the dean can view, generate all reports and Excel forms, change nothing.** Enforced on the server by `readOnly("COLLEGE_SECRETARY")` (`middleware/authorize.ts`), which rejects any non-GET request, applied to the routers that also expose writes: faculty-loads, rooms, student-classes, subjects, curriculum, assignment-requests. Department, academic-year and user lists only had the role added to their GET guards. Dashboard, reports and the Excel exports allow the role directly.
- Not granted: scheduler, Faculty page, Users, Academic years admin, Trash, scheduling rules, grade module. Assignment requests are viewable but the secretary cannot approve or reject them (buttons hidden, and the server blocks POSTs).
- Frontend: sidebar, dashboard (overview + management cards), routes and the Reports page include the role. Subjects and Student classes hide add / edit / delete / bulk actions for it; Rooms, Departments and Curriculum already derived write access from explicit roles. The Users form lists it as a role admins can assign.
- New write endpoints must either not allow the role in `authorize(...)` or sit behind a router that uses `readOnly`.
