<!-- Moved unchanged from dev.md (lines 394-606). Index: dev.md -->

### 7. Curriculum by Year Level, Semester & Subject Filtering

**Data model**

- `Subject` (Prisma) has `yearLevel Int?` (recommended year within curriculum) and `semester Int?` (1 = 1st Sem, 2 = 2nd Sem, 3 = Mid Year).
- `StudentClass` has `yearLevel` and `curriculumId`; we use these plus the selected semester to scope subjects.
- `frontend/src/types/api.ts` `Subject` includes `yearLevel?: number | null` and `semester?: number | null`.

**Seeder updates**

- `backend/prisma/seed.ts` assigns `yearLevel` for demo BSCE/BSEE curricula:
  - BSCE:
    - 1st year: intro math/physics/chemistry, drawing, intro CE.
    - 2nd year: higher math, basic CE surveying/geology/mechanics.
    - 3rd year: structural/hydraulics/geotech/reinf. concrete/steel.
    - 4th year: highways, water resources, management, design project, laws/ethics.
  - BSEE:
    - 1st year: math, physics(+lab), basic circuits(+lab), drafting, intro programming.
    - 2nd year: higher math, devices, signals, digital, DSA.
    - 3rd year: comms, EM fields, microprocessors(+lab), control systems.
    - 4th year: design, data comm, laws/ethics.
- This gives a realistic year-level structure for testing.

**Scheduler integration (class view)**

- In `SchedulerPage`:
  - Derives `currentClass` when `viewMode === "class"` and `studentClassId` is selected.
  - Exposes `currentCurriculumId`, `currentYearLevel`, and a **semester** state (1, 2, or 3) from a dropdown (1st Sem / 2nd Sem / Mid Year).
  - Passes into `CurriculumSubjectTree`: `curriculumId`, `yearLevel`, `semester`, and `classLoads` (for scheduled minutes).
  - The tree filters subjects by the selected semester when all three are set.

**CurriculumSubjectTree behavior**

- **Props:** `curriculumId?`, `yearLevel?`, `semester?` (1/2/3), `classLoads?` (for status highlighting).
- When **no** `curriculumId`/`yearLevel` (faculty view or no class selected):
  - Group subjects by `curriculumId`; show `Ungrouped` for subjects without a curriculum.
- When `curriculumId` and `yearLevel` are set (class view):
  - If `semester` is set, filters subjects to that semester (1st Sem / 2nd Sem / Mid Year) as well.
  - Splits them into:
    - **Main year group**: `subject.yearLevel === yearLevel`.
    - **Others**: same curriculum but `yearLevel` is `null` or different.
  - Renders a focused tree:
    - Header: `Subjects · {curriculum.name} ({ordinal year}, e.g. "3rd year")`.
    - Group 1: `{ordinal year}` (e.g. "3rd year") – **expanded by default**.
    - Group 2: `Others` – **collapsed by default**.
  - Previously, labels were `Year N`; now we use `1st/2nd/3rd/4th year` formatting.

**Unit-to-hours rule (lectures vs laboratories)**

- **Lectures:** 1 unit = 1 hour per week (e.g. 3 units = 3 hrs/week).
- **Laboratories:** 1 unit = 3 hours per week (e.g. 1 unit lab = 3 hrs/week).
- This rule is used consistently in:
  - Auto-scheduler (`facultyLoadService.autoAssignForClass`) when computing required minutes per subject.
  - Curriculum subject tree (`CurriculumSubjectTree.getStatusForSubject`) for full/partial/none highlighting.

**Subject scheduled-state highlighting**

- `CurriculumSubjectTree` receives `classLoads` and computes required vs scheduled minutes per subject using the unit-to-hours rule above.
- Each subject row shows status and label (`x/y hrs`):
  - **Full** (scheduled ≥ required): green-tinted chip `border-emerald-500/70 bg-emerald-50`.
  - **Partial** (0 < scheduled < required): amber-tinted chip `border-amber-400/70 bg-amber-50`.
  - **None** (scheduled = 0): soft red-tinted chip `border-rose-300/60 bg-rose-50`.
- This gives an at-a-glance view of which subjects are fully scheduled, partially scheduled, or not yet assigned.

**Admin UI for year levels**

- `SubjectsPage` form now includes:
  - A "Year level (within curriculum)" numeric field (optional).
  - Table column showing each subject's `yearLevel` (or `—` if unset).
- Create/update payloads send `yearLevel` (number or null) to the backend subjects endpoints.
- This UI is how we "manually construct the curriculum by year level" for each program in a non-hardcoded way.

---

### 8. Automatic Room Assignment (Auto-scheduler) & Reset

**Endpoints**

- `POST /faculty-loads/auto-assign`: Auto-assigns remaining curriculum subjects for a class (CHAIRMAN only).
- `POST /faculty-loads/reset`: Removes all loads for a class in the current academic year/semester (CHAIRMAN only).

**Unit-to-hours rule**

- Lectures: 1 unit = 1 hr/week. Labs: 1 unit = 3 hrs/week.
- Used for required minutes in auto-scheduler and subject status highlighting.

**Auto-scheduler behavior**

- Only assigns subjects in the curriculum for the class's year level (excludes `Others`).
- Does not move or alter existing loads; only adds new loads for unsatisfied subjects.
- Faculty selection: least-loaded faculty in the same department.
- Room selection: capacity ≥ class size, respects `isLab` preference, least-loaded.
- Time slot search: 08:00–17:00, 15‑min increments, avoids faculty lunch (12:00–13:00) when possible.
- **3‑unit lectures:** Prefer MWF (Monday/Wednesday/Friday) — one 1 hr block on each day at the same time — or TTH (Tuesday/Thursday) — one 1.5 hr block on each day at the same time. Tried in that order; if neither fits, falls back to one 3 hr block.
- **Continuous blocks:** Each assignment uses one block per meeting (no splitting). The scheduler can place a single block of **up to 5 hours** per session (e.g. 4‑unit lecture = one 4 hr block; 3‑unit lab = one 3 hr block). For 3‑unit lectures only, MWF or TTH patterns are preferred when they fit; otherwise single blocks are used. Lab separation: if two 3‑hr labs on the same day, at least 1 hr break between.

**Reset schedule**

- `handleResetSchedule` calls `POST /faculty-loads/reset` and refreshes loads.
- Button in the scheduler toolbar: "Reset schedule" (danger variant).

---

### 9. Subject–Faculty Prioritization (Curriculum → Subjects → Faculty)

**Goal**

- Record which faculty are prioritized to teach which subjects. Auto-assign only assigns a subject to faculty who are prioritized for that subject (when prioritization is set).

**Data model**

- `SubjectFacultyPriority` (Prisma): `subjectId`, `facultyId`, `priority` (Int, default 0). Relations to `Subject` and `User`. Unique on `[subjectId, facultyId]`, indexed on both ids.
- `Subject` has `subjectFacultyPriorities SubjectFacultyPriority[]`; `User` has `subjectFacultyPriorities SubjectFacultyPriority[]`.

**API**

- `GET /subjects/:id/prioritized-faculty` — returns list of `{ facultyId, name, email?, priority }` for that subject. Auth: same as subjects (ADMIN, DEAN, CHAIRMAN for read).
- `PUT /subjects/:id/prioritized-faculty` — body `{ facultyIds: string[] }`. Replaces prioritization for that subject. Auth: ADMIN, CHAIRMAN. Chairman scope: only for subjects in their department (via curriculum or subject department).

**Auto-assign integration**

- In `facultyLoadService.autoAssignForClass`, for each subject we load `SubjectFacultyPriority` for that subject (ordered by `priority`).
- If there is at least one prioritized faculty: `facultyPool` = those faculty (optionally same department); choose by least total minutes, then by lower `priority` for tie-breaking.
- If none: keep existing behavior (department match + all faculty fallback).

**Frontend**

- **Subjects page:** Row action "Set prioritized faculty" opens a **drag-and-drop modal** (`PrioritizedFacultyModal.tsx`), similar to the curriculum builder:
  - **Left panel — Faculty by department:** Faculty from `GET /users?role=FACULTY` (with `departmentId` / `department` for grouping) who are not yet in the priority list. Grouped by department (or "No department"). Each faculty is a draggable chip. The left panel is also a droppable zone: dragging a priority-row back here removes that faculty from the list.
  - **Right panel — Priority sequence:** Droppable zone listing the current priority order. Each row is sortable (`@dnd-kit/sortable`): drag to reorder. Each row has a × button to remove. Empty state: "Drop faculty here to set priority order."
  - **Drag behavior:** Pool → Priority = add faculty (at end or before the dropped-on item). Priority → Pool = remove. Within Priority = reorder via sortable.
  - Fetches `GET /subjects/:id/prioritized-faculty` and `GET /users?role=FACULTY` on open. Save calls `PUT /subjects/:id/prioritized-faculty` with the ordered `facultyIds`.

---

### 10. Curriculum Builder (Drag-and-Drop)

**Goal**

- On the Curriculum page, for a selected curriculum, build the curriculum by dragging subjects from a pool into **year + semester** drop zones (e.g. Year 1–5 and Ungrouped, with semester grouping where applicable).

**Route & access**

- Route: `/curriculum/:id/build`. Protected: ADMIN, CHAIRMAN only.
- Entry: Curriculum list row dropdown → "Build" (when `canEdit`).

**Page: CurriculumBuildPage**

- **Left:** Subject pool — subjects not in this curriculum (`curriculumId !== selected id`). Each item is draggable. The pool area is also a droppable zone: dropping a subject from the tree here removes it from the curriculum (`PATCH /subjects/:id` with `curriculumId: null`, `yearLevel: null`).
- **Right:** Curriculum tree — droppable zones by **year level** and **semester** (Year 1 … Year 5, Ungrouped). Each zone lists subjects; subjects in the tree are draggable so they can be moved between years/semesters.
- **Data:** Loads curriculum, its subjects, and all subjects. Pool = subjects not in this curriculum. Subject `yearLevel` and `semester` are sent on PATCH.
- **Drop handling:** Uses `@dnd-kit`. On drop onto pool → remove from curriculum (PATCH with nulls). Onto year/semester zone → PATCH with `curriculumId`, `yearLevel`, and `semester`.
- Single curriculum per subject: adding to a curriculum = moving the subject (no cloning).

---

### 11. Add/Edit Subject Dialog (No Code Input)

**Behavior**

- **Add subject:** No "Code" input. Code is auto-generated from the subject name: spaces → hyphens, non-alphanumeric removed, uppercased, trimmed to 32 chars (e.g. "Engineering Mathematics I" → `ENGINEERING-MATHEMATICS-I`). Fallback if empty: `SUB-<timestamp>`.
- **Edit subject:** Code is not editable. The existing code is shown as read-only text (e.g. "Code: MATH101"). Update payload does not send `code`, so the stored code is unchanged.
- Table still shows the Code column for identification.

---

### 12. Import Curriculum (Image, IUSIS HTML, Clipboard)

**Goal**

- Import curriculum subjects from three sources: an image (OCR), Laravel IUSIS HTML, or plain text copied from the IUSIS checklist. All produce the same review/apply flow with codes, names, units, lab flag, year level, and semester.

**Sources**

1. **From image** — User uploads an image; backend uses Vision API (or Tesseract fallback) to extract subject rows. See `backend/src/modules/curriculum/importFromImage.ts`.
2. **From IUSIS** — User pastes raw HTML from the Laravel curriculum component (right‑click → Inspect → copy outer HTML). Parser: `frontend/src/utils/parseIusisCurriculumHtml.ts`. Detects year/semester from headings and table structure; extracts code, name, units, lab, prerequisites from table rows.
3. **From clipboard** — User copies the checklist from IUSIS as plain text (select table or page and copy). Parser: `frontend/src/utils/parseIusisCurriculumClipboard.ts`. Expects:
   - Header lines (student id, program, name) — ignored.
   - Blocks of: "First Year" / "Second Year" … "Fifth Year"; "First Semester" / "Second Semester" / "Mid Year"; then a header line containing "Code", "Description", "units"; then tab‑separated data rows (Code, Description, units, Grade, Pre-requisite/s). Year and semester are inferred from the last seen headers.

**Behavior (shared)**

- Curriculum page offers two buttons: "Import from IUSIS", "Import from clipboard". Each opens the same import dialog with a source tab (From IUSIS / From clipboard).
- User provides the chosen input (HTML paste or plain-text paste) and clicks Parse HTML / Parse clipboard.
- Import review table shows parsed subjects with code, name, units, year, semester, lab; user can edit rows, add/remove, then choose a curriculum and click "Apply import".
- Apply creates/updates subjects and assigns them to the selected curriculum with `yearLevel` and `semester` set (`POST /curriculum/apply-import`).
- Curriculum viewer and builder support semester (column and grouping).

---

### 13. Clear Curriculum

**Goal**

- Allow removing all subject–curriculum associations for a curriculum in one action (e.g. before re-importing).

**Behavior**

- Curriculum list or detail has a "Clear curriculum" (or similar) action.
- Backend: endpoint (e.g. `POST /curriculum/:id/clear` or `DELETE /curriculum/:id/subjects`) that sets `curriculumId` (and optionally `yearLevel`, `semester`) to null for all subjects that currently belong to that curriculum.
- After clear, the curriculum has no subjects; subjects remain in the system and can be re-assigned or imported again.

---

### 14. Schedule Grid: Subject Colors

**Behavior**

- `ScheduleGrid` uses a fixed palette of **12 distinct colors** (one per subject) so blocks are easier to distinguish at a glance.
- Color is derived from subject id or index (e.g. modulo into the palette). Defined in `ScheduleGrid.tsx` (e.g. `SUBJECT_COLORS`, `colorClass`).

---
