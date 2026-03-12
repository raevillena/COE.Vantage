## Scheduler UX / Logic Notes

### Context

This file documents the scheduler work done so far so future changes (and chats) have the same context without re‑deriving behavior from scratch.

All changes are in the current React/TypeScript frontend (Next.js-style), primarily around `SchedulerPage` and its child components.

---

### 1. Dragging + Moving Loads

**Problems**

- Moving a load did not preserve the original duration.
- Clicks sometimes started drags unintentionally.
- Drag preview was generic and not aligned with the real block.
- After moving, the availability overlay (faculty/room busy blocks) could show stale/busy slots at the old position.
- Dropping on a time that conflicts with faculty/room was allowed, only failing later.

**Solutions**

- **Duration preservation:** When a load is dragged to a new slot, we:
  - Snap the new start time to the 15‑minute grid.
  - Compute `durationMinutes = endTime - startTime` from the original load.
  - Set `endTime = startTime + durationMinutes` for the moved load.
- **Drag activation threshold:** Configured `PointerSensor` with `activationConstraint: { distance: 8 }` so small clicks do not start a drag.
- **Accurate drag preview:** Added `LoadBlockPreview` used in `DragOverlay` that:
  - Uses the same color, subject, room, and faculty line as real blocks.
  - Shows "Drop at …" and the resulting time range while hovering over a slot.
- **Optimistic move:** On drop, we:
  - Update `loads` (main grid) and `roomLoads` immediately.
  - Patch `/faculty-loads/:id` with the new day/time.
  - On error, revert by reloading data and clearing `editingLoadId` if necessary.
- **Overlay kept in sync optimistically:**
  - Introduced `overlayFacultyLoads` / `overlayRoomLoads`.
  - After any successful move/resize, we call `refreshOverlayForLoad(updatedLoad)` which:
    - Updates the matching entry for that load in the overlay arrays synchronously (no extra API request).
    - This removes the old busy slot and adds the new one without visual delay.

- **Drop‑time conflict handling (faculty/room):**
  - On drag end, before moving, we check:
    - If the drop interval overlaps any `overlayFacultyLoads` for the same faculty (excluding this load).
    - If the drop interval overlaps any `overlayRoomLoads` for the same room (excluding this load).
  - If there is a conflict, we:
    - Do **not** move the block.
    - Set a `moveConflict` state describing: load, target day/time, facultyConflict, roomConflict.
    - Render an **anchored dialog** above the grid with:
      - Explanation of which schedules are in conflict.
      - The attempted day/time.
      - Inline dropdowns to resolve:
        - If faculty conflict: a faculty select (populated from `faculties`) that calls `handleResolveFacultyConflict(newFacultyId)`.
        - If room conflict: a room select (from `rooms`) that calls `handleResolveRoomConflict(newRoomId)`.
      - A `Close` button to dismiss.
    - `handleResolveFacultyConflict` / `handleResolveRoomConflict`:
      - Patch `/faculty-loads/:id` with the new faculty/room and the **target** day/time.
      - On success: toast, clear `moveConflict`, and `refreshLoads()` + `refreshRoomLoads()`.

---

### 2. Resizing Loads

**Problems**

- Resizing interfered with drag (pointer events bubbling to dnd-kit).
- User couldn't see availability overlays while resizing.
- Overlay loads could become stale after a resize.

**Solutions**

- **Resize behavior:**
  - Resizing is done from a bottom resize handle (`data-resize-handle`) inside each `ScheduleBlock`.
  - The handle stops pointer propagation to prevent starting a drag.
  - While dragging resize:
    - We compute end time from pointer Y, snapped to 15 minutes and clamped within grid bounds.
    - The block's height and the time text update live using `resizePreviewEndMinutes`.
  - On mouse up:
    - If the new end time changed, we call `onLoadResize(load, { startTime, endTime })`.
    - `handleLoadResize`:
      - Updates `loads`, `roomLoads`, and `editingLoad` (if relevant).
      - Patches `/faculty-loads/:id` with the new time range.
      - On success, shows "Time updated"; on failure, reloads from API.
      - Calls `refreshOverlayForLoad(updated)` so overlay matches the new duration.

- **Showing overlay while resizing:**
  - `ScheduleGrid` now accepts `onLoadResizeStart` / `onLoadResizeEnd`.
  - When resize starts:
    - `resizingLoadId` is set.
    - `overlayFacultyId` / `overlayRoomId` are set from that load, causing overlay fetch.
  - While `resizingLoadId` is set, the `AvailabilityOverlay` renders (with faculty/room busy blocks).
  - When resize ends:
    - `resizingLoadId` is cleared.
    - If we're **not** adding a new assignment and not dragging, we clear overlay state so it doesn't linger.

---

### 3. Pending Assignments (Adding New Blocks)

**Previous issues**

- Dropping a subject defaulted the block to Monday 08:00–09:00, creating overlap and confusion.
- Time inside the Assignment form did not stay in sync with any visual pending block.
- Pending block overlays (faculty/room) overlapped class schedule and looked cluttered.

**Solutions**

- **Pending state model:**
  - `pendingAssignment` holds:
    - `subjectId`, `subjectCode`, `subjectName`
    - Optional `studentClassId`, `dayOfWeek`, `startTime`, `endTime`, `facultyId`, `roomId`.
  - Dropping a subject now **only** sets subject (and class in class view) – no default day/time.

- **Faculty/room selection and overlay behavior:**

  - AssignmentForm:
    - Reports `onFacultyIdChange` / `onRoomIdChange` to `SchedulerPage`.
    - Scheduler sets `overlayFacultyId` / `overlayRoomId`, which triggers faculty/room overlay fetches.
  - `AvailabilityOverlay` in the main grid:
    - Renders **only** when we are in the "add assignment" flow (`pendingAssignment !== null`) or while dragging/resizing an existing load.
    - Uses a dedicated color for faculty busy blocks and another for room busy blocks.
    - Is rendered **under** schedule blocks (lower z‑index) so blocks stay visually dominant.

- **Suggested free slot placement:**

  - When a faculty is selected for a pending assignment:
    - We compute the first 1‑hour free slot (Mon–Sat, 7:00–18:00) that is free for:
      - The current class (when in class view), and
      - That faculty's schedule (from `overlayFacultyLoads`).
    - If found, we set `pendingAssignment.dayOfWeek/startTime/endTime` and show a dashed "Pending" block there.
  - When a room is selected:
    - We check if the current suggested slot is also free in `overlayRoomLoads`.
    - If not, we search again including room loads and move the pending block to the first fully free slot.
  - Once the user manually drags the pending block (`pendingAssignmentDragged`), auto‑suggestion stops changing its position.

- **Dragging the pending block (day + time) and syncing with form:**

  - `ScheduleSlotOverlay` shows a dashed pending block.
  - We added `onPendingMove` so dragging that dashed block:
    - Updates `pendingAssignment.dayOfWeek`, `startTime`, `endTime` as you drag (snapped to 15 minutes).
    - Allows moving across **days** as well as times.
  - The Assignment form receives a `liveTime` prop:
    - An effect keeps `dayOfWeek`, `startTime`, and `endTime` fields in sync with the pending block while in "add new" mode (no `editingLoadId`).

---

### 4. Overlays: Visibility, Z‑Ordering, and Sync

**Problems**

- Overlays initially rendered over the class schedule, making it hard to see the actual blocks.
- After enabling drag/resize overlays, they sometimes disappeared or flickered.
- Faculty/room overlays could become out of sync when loads moved or resized.

**Solutions**

- **Z‑order tuning:**
  - `ScheduleGrid` root: `relative` (no z-index).
  - `ScheduleBlock` (real blocks): `absolute z-20`.
  - `ScheduleSlotOverlay` / `AvailabilityOverlay`: `absolute z-10`.
  - Conflict dialog: `absolute z-30` so it always appears above blocks and overlays.

- **Overlay lifecycle:**
  - When **adding** an assignment:
    - Overlays follow selected faculty/room until the form is closed.
  - When **dragging** an existing load:
    - On drag start, we set overlay IDs from the load; overlay appears for that faculty/room.
    - On drag end/cancel, if not in add flow, we clear overlay state.
  - When **resizing**:
    - Use `resizingLoadId` to show overlay only while resizing, then clear when done.

- **Optimistic overlay updates:**
  - No additional network round‑trips after each move/resize.
  - `refreshOverlayForLoad(updatedLoad)` updates `overlayFacultyLoads` / `overlayRoomLoads` in memory so the busy blocks always reflect the current position/duration of the moved/resized load.

---

### 5. Assignment Form Behavior & Selects

**Problems**

- When selecting a faculty/room, the selects sometimes reverted to "Select faculty/room".
- Form state could be overwritten when parent props (initialValues) changed, especially for pending assignments.
- Time fields did not reflect drag/resize of the pending block until after save.

**Solutions**

- **Form syncing model:**
  - `AssignmentForm` takes:
    - `initialValues`: partial `AssignmentFormValues`.
    - `formKey`: stable key that changes only when switching to a different assignment (editing vs pending).
    - `initialValuesReady`: for edit mode, ensures we only sync after the `editingLoad` has been fetched.
    - `liveTime`: optional live day/time for pending assignments.
  - Effects:
    - On `formKey` + `initialValuesReady`: fully reset all form fields from `initialValues` and clear preview.
    - On `liveTime` (only when adding a new assignment): update day/time to follow the pending block.

- **Select behavior:**
  - Faculty and room selects use standard `Select.Root` with internal state (`facultyId`, `roomId`).
  - When the user chooses a faculty/room:
    - We set local state (so the label shows the chosen name).
    - We call `onFacultyIdChange` / `onRoomIdChange` for overlay behavior.
  - We removed any auto‑resetting logic that cleared these fields when `initialValues` did not explicitly include `facultyId`/`roomId` for pending assignments.

---

### 6. Conflict Prompt UX (Anchored Dialog)

**Behavior**

- Triggered when a user **drops** an existing load onto a slot where:
  - Faculty overlay indicates the slot is busy (excluding this load), and/or
  - Room overlay indicates the slot is busy (excluding this load).

- Dialog details:
  - Anchored above the schedule grid (`absolute inset-0 z-30`).
  - Shows:
    - Which schedules are in conflict (faculty, room, or both).
    - Target day and time range.
  - Provides inline resolution:
    - **Change faculty** dropdown (if faculty conflict) that immediately patches the load with the new faculty and target time.
    - **Change room** dropdown (if room conflict) that immediately patches the load with the new room and target time.
  - On success:
    - Shows a toast.
    - Clears `moveConflict`.
    - Refreshes loads and room loads so main grid and overlays match.
  - `Close` button to dismiss without changes.

This keeps the user in context and allows resolving conflicts **in-place**, without having to open the right‑hand Assignment panel.

---

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

### 15. Forms: Validation and Labels

**Validation**

- We avoid HTML `required` on inputs so that fields can be left blank while editing without immediate browser validation.
- Validation runs **on submit**: validators check required fields and business rules; errors are shown (e.g. inline or toast) and the form is not submitted until valid.
- Applied across CRUD forms: Student Classes, Curriculum, Departments, Rooms, Academic Years, Subjects, Users.

**Labels**

- Forms use visible **labels** (not only placeholders) for fields so the purpose of each field is clear even when the field already has a value (e.g. Student Class form).

---

### 16. Theme (Light / Dark / System)

**Mechanics**

- Tailwind v4 is configured via CSS in `src/style.css` using `@theme` for semantic tokens like `--color-surface`, `--color-foreground`, `--color-border`, etc.
- We added `@custom-variant dark (&:where(.dark, .dark *));` so `dark:*` utilities can be used based on a `.dark` class on the root.
- Light palette is the default `@theme` block; dark mode overrides the same CSS variables inside `:root.dark { ... }`, so classes like `bg-surface` / `text-foreground` automatically switch when dark mode is active.

**Bootstrap (no FOUC)**

- `index.html` includes a small inline `<script>` in `<head>` that runs before React:
  - Reads `localStorage.theme` (`\"light\" | \"dark\" | \"system\"`).
  - Falls back to `\"system\"` when unset or invalid.
  - Applies / removes the `dark` class on `<html>` based on the stored preference + `prefers-color-scheme: dark`.
- This prevents a flash of the wrong theme between first paint and React hydration.

**Runtime theme context**

- `src/context/ThemeContext.tsx` exports a `ThemeProvider` and `useTheme()` hook.
- `ThemePreference` is one of `\"light\" | \"dark\" | \"system\"` (user preference); `ResolvedTheme` is `\"light\" | \"dark\"` (what is actually shown).
- The provider:
  - Initializes from `localStorage.theme` (or `\"system\"`).
  - Computes `resolvedTheme` using `matchMedia(\"(prefers-color-scheme: dark)\")` when in `\"system\"` mode.
  - Writes updates back to `localStorage` and keeps `document.documentElement.classList` in sync (adds/removes `.dark`).
  - When following system, listens for OS theme changes and updates `resolvedTheme` + root class accordingly.
- `main.tsx` wraps the app in `<ThemeProvider>` so any component can read or change the theme.

**Toggle UI**

- `AppBar` uses `useTheme()` to show a small theme toggle button in the top-right.
- The button cycles `ThemePreference` in order: Light → Dark → System → Light.
- It shows:
  - An icon: ☀️ for resolved light, 🌙 for resolved dark.
  - A label: `Light`, `Dark`, or `System` (current preference).
- This lets users explicitly choose a theme or follow their OS preference at any time.

**Schedule grid colors**

- `ScheduleGrid` keeps a palette of 12 subject colors, now tuned for both themes:
  - Each entry uses a light + dark class, e.g. `bg-blue-300 dark:bg-blue-600`.
  - This ensures subject blocks remain distinct and readable on both light and dark surfaces.

---

### 18. Curriculum Builder: Remove & Optimistic Updates

**Remove behavior**

- In `CurriculumBuildPage`:
  - **Drag to pool**: Dragging a subject from any year/semester/`Ungrouped` zone into the **Subject pool** removes it from the curriculum via `PATCH /subjects/:id` with `curriculumId: null`, `yearLevel: null`, and `semester: null`.
  - **X button**: Each subject tile in the curriculum tree has an `×` button; clicking it performs the same update to remove the subject from the curriculum.

**Optimistic updates**

- Previously, the builder reloaded all data after every change, which felt slow even when the backend was fast.
- Now:
  - On remove (X or drag-to-pool), the subject is immediately removed from `curriculumSubjects` and its entry in `allSubjects` is updated to clear `curriculumId/yearLevel/semester`. The API call runs in the background; on error we reload once.
  - On move/add (drag from pool into a year/semester, or drag within the tree), the subject’s `yearLevel/semester` (and `curriculumId` when adding) are updated in memory first, then patched via API. Errors trigger a reload to resync.
- This makes curriculum building feel instant while still keeping the backend as the source of truth.

---

### 19. Whole-College Workload Excel Report

**Endpoint & access**

- `GET /reports/college-workload?academicYearId=...&semester=...` returns an Excel workbook summarizing all faculty loads for a given academic year + semester.
- Lives in the `reports` module:
  - Controller: `collegeWorkloadReport` in `backend/src/modules/reports/reportController.ts`.
  - Service: `getCollegeFacultyLoadsForReport` and `buildCollegeWorkloadWorkbook` in `backend/src/modules/reports/reportService.ts`.
- Auth:
  - Only `ADMIN`, `DEAN`, and `CHAIRMAN` can download the whole-college workload.
- Query parameters:
  - `academicYearId` (required, must be an active academic year).
  - `semester` (1, 2, or 3 for Mid Year).

**Excel structure (built with `exceljs`)**

- Workbook has three sheets:
  - **`Workload`**:
    - One row per scheduled block (`faculty`, `subject`, `class`, `day`, `time`, `room`, `lab` flag, units).
    - Useful as a raw export for custom analysis.
  - **`Totals`**:
    - One row per faculty with:
      - `Faculty`
      - `Total Units` (sum of unique subject-unit combinations per class)
      - `Subjects` (count of distinct subject+class combinations taught).
  - **`FacultyDetail`**:
    - Stacked per-faculty sections matching the manual workload template:
      - Header row: `Faculty: {Name}`.
      - Columns: `Course Code`, `Course Title`, `Units`, `Time`, `Day`, `Room / Building`, `Instructor`.
      - Rows are **grouped per subject + class + time + room**; all meeting days for that group are combined into one `Day` pattern:
        - Uses tokens `M`, `T`, `W`, `Th`, `F`, `S`, e.g. `MWF`, `TTh`, `MW`, etc.
      - `Units` shows the subject’s units once per subject/class, not per meeting.
      - A `Total Units` row at the bottom of each faculty section sums units across unique subject+class combinations for that faculty.

**Frontend integration**

- `ReportsPage.tsx` adds a **College workload (Excel)** card:
  - Reuses the existing **Academic Year** (active-only) and **Semester** selectors.
  - Button: `Download Excel` calls `/reports/college-workload` with `academicYearId` and `semester`.
  - Downloaded filename: `college-workload-{academicYearName}-S{semester}.xlsx` (or AY id fallback).

---

### 17. Schedule Color Palettes (Per User)

**Palette system**

- `src/context/SchedulePaletteContext.tsx` defines named palettes of Tailwind background classes for subject blocks:
  - Base palettes: `balanced`, `soft`, `vivid`, `cool`, `warm`, `earth`, `ocean`, `forest`.
  - Dark-tuned variants: `balancedDark`, `softDark`, `vividDark`, `coolDark`, `warmDark`, `earthDark`, `oceanDark`, `forestDark`.
- Each palette is a list of 12 color classes (with `dark:` variants) used round-robin across subjects.
- The current palette is stored in `localStorage.schedulePalette` and exposed via `useSchedulePalette()` (`paletteId`, `palette`, `setPaletteId`, and the list of available palettes).

**Usage**

- `ScheduleGrid` no longer hardcodes a `SUBJECT_COLORS` array; instead it calls `useSchedulePalette()` and uses `palette.colors` when computing the block background class.
- Text inside schedule blocks uses high-contrast neutral text colors (`text-gray-900 dark:text-gray-100` for primary line, `text-gray-700 dark:text-gray-300` for secondary line) so it remains readable regardless of palette.

**Palette selection**

- **Profile page (`UserProfilePage`)**:
  - Adds a “Schedule color palette” section with a select (`Balanced`, `Soft`, `Vivid`, `Cool`, `Warm`, `Earth`, `Ocean`, `Forest`, plus dark variants).
  - Changes update `schedulePalette` in localStorage and immediately update colors in all scheduler views.
- **Scheduler toolbar (`SchedulerPage`)**:
  - Adds a compact “Block colors” select on the right of the toolbar so users can change the palette while scheduling.

---

### 20. Auth & Branding (Login / Reset / Theme)

**Auth layout**

- `src/components/layout/AuthLayout.tsx` is the shared layout for unauthenticated pages (`LoginPage`, `ResetPasswordPage`):
  - Left side: branded banner (`/banner.svg` in light mode, `/banner-dark.svg` in dark mode) within a bordered panel.
  - Right side: centered card with logo, app title/subtitle, and the actual form.
  - The outer wrapper uses `auth-bg` to apply a subtle, CSS-only abstract background; the login card itself is rendered above it (`relative z-10`) so the card surface stays clean.
- A small footer under the card shows the app version:
  - `const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "v0.0.0";`
  - Rendered as: `COE.Vantage • {APP_VERSION}`.

**Theme toggle (light / dark / system)**

- `AuthLayout` and `AppBar` both use `useTheme()` (from `src/context/ThemeContext.tsx`) to expose a theme toggle:
  - Preference cycles: **Light → Dark → System → Light**.
  - `ResolvedTheme` (`"light" | "dark"`) drives visuals and the `.dark` class on `<html>`.
- Toggle UI:
  - Top-right button in `AuthLayout` (visible on login and reset-password screens).
  - Right side of the top app bar in authenticated views.
  - Each toggle shows:
    - A **monochrome SVG icon** using `stroke="currentColor"`:
      - Sun icon when `resolvedTheme === "light"`.
      - Crescent moon icon when `resolvedTheme === "dark"`.
    - A label: `Light`, `Dark`, or `System` (current preference).

**Login validation & error handling**

- `src/pages/login/loginValidation.ts` centralizes login form validation and error parsing:
  - `validateLoginFields(email, password)`:
    - Trims email, requires non-empty email/password.
    - Checks a simple email regex matching backend expectations.
    - Returns per-field errors or `null` when valid.
  - `getLoginError(err)`:
    - Accepts an Axios error from `/auth/login`.
    - Distinguishes **network errors** (no `response`) from API responses:
      - Network: "Could not reach server. Check your connection and try again." (or a generic failure).
      - HTTP 400 with `ZodError` shape: maps first `email` / `password` messages from `errors.body` (or top-level `errors`) to inline field errors.
      - HTTP 401 with `AppError`: uses `data.message` (e.g. "Invalid email or password") as the main message.
- `LoginPage`:
  - No longer uses HTML `required`; the form adds `noValidate` and relies on `validateLoginFields` on submit.
  - Tracks `fieldErrors` for `email` and `password`, shows inline messages and `aria-invalid`/`aria-describedby` for accessibility.
  - Clears field-specific errors on change for a smoother UX.
  - Uses `getLoginError` in both:
    - Normal login submit.
    - Quick sign-in (dev) buttons.
- API client integration:
  - `src/api/apiClient.ts` has a response interceptor that auto-refreshes access tokens on **401** via `/auth/refresh`, but it explicitly **skips** this behavior for auth endpoints:
    - For `/auth/login` and `/auth/refresh`, a 401 is passed through directly. This ensures:
      - Wrong credentials on login do **not** trigger refresh.
      - The login page receives the original 401 error and can show the correct message and stop the loading state.

**Environment variables (summary)**

- **Backend** (`backend/env.example`):
  - `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`.
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_EXPIRY`.
  - `FRONTEND_ORIGIN` (e.g. `http://localhost:5173`) for CORS and password reset link generation.
  - Optional password reset + SMTP settings for emailing reset links.
- **Frontend** (`frontend/.env` – sample in `frontend/.env.example`):
  - `VITE_API_URL` — base URL for the backend API (e.g. `http://localhost:4000/api`).
  - `VITE_APP_VERSION` — string shown in the auth footer (e.g. `v1.0.0`); when unset, the UI falls back to `v0.0.0`.

---

### 21. Copy Class Schedule From Previous Term

**Goal**

- Allow a chairman to copy a **class schedule** (faculty loads for a specific student class) from a previous academic year and semester into the **currently selected** academic year and semester in the Scheduler, while avoiding conflicts and showing a clear summary of what was copied or skipped.

**Backend**

- New service in `facultyLoadService`:
  - `copyClassSchedule(body: CopyFromPreviousFacultyLoadBody): Promise<CopyClassScheduleResult>`.
  - Input (`CopyFromPreviousFacultyLoadBody` from `facultyLoadSchemas`):
    - `studentClassId` — class whose schedule will be copied.
    - `sourceAcademicYearId`, `sourceSemester` — term to copy **from**.
    - `targetAcademicYearId`, `targetSemester` — term to copy **into**.
  - Steps:
    - Reject if source and target term are identical.
    - Load all `FacultyLoad` rows for the class in the **source** term (includes subject/faculty/room for summary).
    - For each source load, build a candidate payload for the target term:
      - Same faculty, subject, class, room, day of week, start/end time.
      - Target `academicYearId` and `semester`.
    - Call `checkConflicts(payload, tx)` (from `conflictService`) inside a transaction to evaluate:
      - Faculty/room/student overlaps, capacity, and lab-room mismatch.
    - If any conflict or constraint is present:
      - The load is **not** created.
      - A `SkippedFacultyLoadSummary` entry is added with subject, faculty, room, day/time and a `reason` string composed from the conflict flags (e.g. "Faculty has another class at this time; Room is already in use at this time").
    - If there are **no** conflicts:
      - Create a new `FacultyLoad` in the target term.
      - Record a `CopiedFacultyLoadSummary` entry.
    - The whole operation runs inside a transaction so it is consistent.
  - Result (`CopyClassScheduleResult`):
    - `copied: CopiedFacultyLoadSummary[]`
    - `skipped: SkippedFacultyLoadSummary[]`
    - Each summary row includes subject code/name, faculty name, room name, day of week, and time.
- New endpoint in `facultyLoadController`/`facultyLoadRoutes`:
  - `POST /faculty-loads/copy-from-previous`
  - Body: `CopyFromPreviousFacultyLoadBody`.
  - Validation: `copyFromPreviousFacultyLoadSchema` in `facultyLoadSchemas` (semesters 1–3).
  - Auth: `ADMIN`/`DEAN`/`CHAIRMAN` (route uses `authenticate` + `authorize("ADMIN", "DEAN", "CHAIRMAN")`, then further `authorize("CHAIRMAN")` for this specific route).
  - Response: `CopyClassScheduleResult` JSON.

**Frontend (Scheduler)**

- Types (`types/api.ts`):
  - `CopyFacultyLoadSummary`, `CopySkippedFacultyLoadSummary`, and `CopyFacultyLoadsSummary` to match the backend response.
- Scheduler UI (`SchedulerPage.tsx`):
  - New state:
    - `copyDialogOpen`, `copySourceAcademicYearId`, `copySourceSemester`.
    - `copyLoading`, `copySummary: CopyFacultyLoadsSummary | null`, `copyError`.
    - Derived helpers: `currentAcademicYear` and `previousAcademicYears` (all academic years except the current one).
  - Toolbar:
    - In **class view**, when `academicYearId` and `studentClassId` are set:
      - Adds a `"Copy from previous term"` button beside Auto-schedule and Reset.
      - Disabled when there are no other academic years to copy from or while copying.
  - Copy dialog:
    - Opens when the button is clicked.
    - Shows **target context**: class name, current academic year, and current semester.
    - Lets the user choose:
      - **Source academic year** from `previousAcademicYears`.
      - **Source semester** (1st, 2nd, Mid Year).
    - On **Copy schedule**:
      - Calls `POST /faculty-loads/copy-from-previous` with the selected source term and the current scheduler term as target.
      - On success:
        - Stores the returned `CopyFacultyLoadsSummary` in state.
        - Refreshes both main loads and room loads.
        - Shows a toast like `"Copied X blocks, skipped Y."`.
      - On failure:
        - Stores `copyError` and shows a toast built from `getApiErrorMessage`.
  - Summary view:
    - When `copySummary` is set, the dialog switches to a read-only summary:
      - Overview line: `Copied X blocks, skipped Y.`
      - Optional **Copied** table (if any blocks were copied) showing:
        - Subject, faculty, room, day of week, and time.
      - **Skipped** table (always shown, with a “no skipped blocks” message when empty) showing the same plus a **Reason** column built from the backend’s conflict explanation (e.g. faculty/room busy, capacity, lab-room mismatch).
    - A single **Close** button (Dialog.Close) dismisses the summary and dialog.

---

### 22. Users: Faculty Import, Status, Search & Departments: View Faculties

**Faculty import (Users page, ADMIN only)**

- **Import faculty** button opens a dialog with:
  - **Paste**: Textarea for tab- or comma-separated data; "Parse and preview" builds a grouped preview.
  - **Upload**: File input for CSV/TSV (e.g. exported from Excel/Sheets). File is read as UTF-8 so ñ and other Unicode in names are preserved.
- **Expected CSV format**: First row = header. Columns detected by header names (order-independent):
  - **Department**, **Name**, **Role**, **Max_Units** (or "Max Units"), **Status**.
- **Parsing** (`facultyImportUtils.ts`):
  - `splitLine`: Handles tab-separated (Excel paste) and CSV with quoted fields (commas inside quotes preserved).
  - Header row is skipped; column indices are resolved from header labels (e.g. `Max_Units`, `max units`).
  - Name column: supports "Last, First M." format; normalized to "First M. Last" for display and email generation.
  - Names support Unicode (e.g. ñ/Ñ); no stripping of non-ASCII.
- **Email generation**: `formatEmailFromName` — first letter of first name + middle initial + last name (no spaces) @ mmsu.edu.ph; Ñ lowercased to ñ. Example: "Juan Peña" → jpeña@mmsu.edu.ph.
- **Preview**: Grouped by department; each group has a department dropdown (auto-matched from name/code when possible). Per row: Name, Status, Role (dropdown), Max units (read-only), Email (editable). Default password for all imported users; one "Create users" submits each as POST /users.
- **Defaults**: Role from file or inferred from Status (e.g. "dean" → DEAN, "chair" → CHAIRMAN); if Role column empty, default FACULTY. Max units: from file; blank → 18 for FACULTY/CHAIRMAN; explicit **0** → stored as 0 (faculty cannot receive any load). Status from file is stored on the user (see below).

**User model: status and maxUnits**

- **status** (optional string): Added to `User` in Prisma; migration `add_user_status`. Stored from import or set in Add/Edit User form (e.g. Full-time, Part-time). Shown in Users table, View faculties dialog, and import preview; included in user search.
- **maxUnits**: Backend validation changed from `.positive()` to `.min(0)`. Zero means faculty cannot receive any load; null = no cap. Add/Edit form and import support 0.

**Backend: email validation and status**

- **Email**: Custom Zod validator `emailWithUnicode` allows Unicode in the local part (e.g. jpeña@mmsu.edu.ph) so names with ñ save without validation errors. Used for create and update user.
- **status**: In create/update user schemas as `z.string().max(100).optional().nullable()`; service and list/get/trash include `status` in select and data.

**Users page: search and UI**

- **Search bar** (when list is non-empty): Single input with search icon; filters by name, email, role, department name, or status (case-insensitive). "No users match …" + Clear search when no results.
- **Add/Edit User**: Status field added (optional); password field has show/hide toggle (eye icon). Default max units 18 for new users.

**Departments: View faculties**

- Each department row has an **Actions** dropdown. First option: **View faculties** (all roles); then Edit / Move to trash (when `canManage`).
- **View faculties** opens a dialog titled "Faculties — {Department name}", calls `GET /users?departmentId={id}` (ADMIN only for that endpoint), and shows a table: Name, Email, Role, Status, Max units.

---

### 23. Search on management pages

**Goal**

- On list/management pages where data can grow, provide a client-side search bar so users can quickly filter by visible fields without scrolling.

**Pattern (shared across pages)**

- **State:** `searchQuery` (string).
- **Derived:** `searchLower = searchQuery.trim().toLowerCase()`, `filteredList = searchLower ? list.filter(...) : list`.
- **UI:** When `list.length > 0`, show a search bar: relative wrapper, search icon on the left, input with `pl-9`, placeholder describing searchable fields, `aria-label` for accessibility.
- **Table:** Renders `filteredList` instead of `list`.
- **Empty filter state:** When `filteredList.length === 0` and `searchQuery.trim() !== ""`, show “No [items] match ‘…’.” and a **Clear search** button that sets `searchQuery` to `""`.

**Pages and searchable fields**

| Page | Searchable fields |
|------|--------------------|
| **Users** | Name, email, role, department, status |
| **Subjects** | Code, name, curriculum name, department name |
| **Departments** | Name |
| **Rooms** | Name, capacity, department name, control department name, lab (yes/no) |
| **Curriculum** | Name, department name |
| **Student Classes** | Name, year level, student count, curriculum name |
| **Academic Years** | Name, active (yes/no) |
| **Requests** (assignment requests) | Faculty name, subject code/name, class name, room, requested-by name/department, status |

Filtering is case-insensitive and substring-based. No backend changes; all filtering is done in the frontend on the already-loaded list.

---

### 24. Sidebar navigation icons

**Goal**

- Improve navigation scanability and consistency by showing an icon next to each sidebar link.

**Implementation**

- **Library:** `lucide-react` — tree-shakeable, consistent stroke icons; no other icon library is used in the frontend.
- **Component:** `Sidebar.tsx` (`frontend/src/components/layout/Sidebar.tsx`):
  - `NavItem` accepts an `icon` prop: a Lucide component (e.g. `LayoutDashboard`). The icon is rendered at 18px with `shrink-0` and `aria-hidden` (link text remains the accessible label).
  - `RequestsNavItem` uses the `Inbox` icon and keeps the existing pending-count badge.
- **Icon mapping** (for reference when adding/renaming nav items):
  - Home: Dashboard → `LayoutDashboard`.
  - Scheduler: Scheduler → `CalendarRange`, Requests → `Inbox`.
  - Schedules: Faculty schedule → `UserCircle`, Class schedule → `GraduationCap`, Room availability → `DoorOpen`.
  - Management: Rooms → `Building`, Departments → `Building2`, Curriculum → `BookOpen`, Subjects → `BookMarked`, Student classes → `GraduationCap`, Users → `Users`, Academic years → `Calendar`, Scheduling rules → `SlidersHorizontal`, Trash → `Trash2`.
  - Reports → `FileText`.
  - Profile → `User`, About → `Info`.

**Conventions**

- Use a single icon per nav item; prefer semantic fit (e.g. `Building` for room management, `DoorOpen` for room availability view).
- Keep icon size at 18px for consistency with existing sidebar density.

---

## Parked / Incomplete Features

### P1. Resizable Scheduler Panels (2XL Breakpoint) — PARKED

**Goal**

- At 2xl (≥1536px), replace the fixed CSS grid layout with user-resizable panels (curriculum / main schedule / assignment) using `react-resizable-panels`. Panel sizes would persist to `localStorage` and survive reloads.

**What was attempted**

- `react-resizable-panels` (`Group`, `Panel`, `Separator`, `useDefaultLayout`) was integrated into `SchedulerLayout` behind a `useIs2xl()` breakpoint guard.
- A custom `@dnd-kit` pointer sensor (`PointerSensorIgnoreResizeSeparator`) was created to prevent drag-and-drop from stealing pointer events on `[data-separator]` elements.
- Multiple rounds of debugging (manual pointer capture, capture-phase listeners, layout validation, `localStorage` corruption detection) were attempted.

**Why it was parked**

- The `react-resizable-panels` library did not reliably resize panels. Events fired but panels did not visually move. Root causes investigated:
  - `@dnd-kit`'s `DndContext` calling `preventDefault()` on pointer events before the library could process them.
  - `localStorage` storing corrupted flex-grow values instead of 0–100 percentages, causing `ariaValueMin === ariaValueMax` (locked panels).
  - `Separator` components rendering at 0px width (invisible, unclickable) without explicit styling.
- Each fix resolved one symptom but resizing still failed. After significant iteration, the feature was parked to avoid further time investment.

**What was reverted**

- Removed `react-resizable-panels` dependency (`npm uninstall`).
- Removed all `Group`, `Panel`, `Separator`, `useDefaultLayout` usage from `SchedulerPage.tsx`.
- Removed `getValidatedStorageItem` localStorage validation helper.
- Removed `PointerSensorIgnoreResizeSeparator` custom sensor file.
- Reverted `SchedulerLayout` to a pure CSS grid layout (fixed proportions at each breakpoint).
- Restored standard `PointerSensor` from `@dnd-kit/core`.

**To revisit**

- Consider an alternative library (e.g. `allotment`, `react-split`, or a custom flexbox + drag implementation).
- Ensure any resize library coexists cleanly with `@dnd-kit`'s document-level pointer listeners.
- Test on a minimal reproduction first before integrating into the scheduler's complex component tree.

