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

### 7. Curriculum by Year Level & Subject Filtering

**Data model**

- `Subject` (Prisma) now has `yearLevel Int?` to represent the recommended year within its curriculum.
- `StudentClass` already has `yearLevel` and `curriculumId`, which we now use to automatically scope subjects.
- `frontend/src/types/api.ts` `Subject` interface includes `yearLevel?: number | null`.

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
  - Exposes `currentCurriculumId = currentClass?.curriculumId` and `currentYearLevel = currentClass?.yearLevel`.
  - Passes these into `CurriculumSubjectTree`:
    - `curriculumId` and `yearLevel`.
    - `scheduledSubjectIds` from `loads` so the tree knows which subjects are already scheduled in the current view.

**CurriculumSubjectTree behavior**

- When **no** `curriculumId`/`yearLevel` (faculty view or no class selected):
  - Keeps original behavior:
    - Group subjects by `curriculumId`.
    - Show an `Ungrouped` section for subjects without a curriculum.
- When `curriculumId` and `yearLevel` are set (class view):
  - Filters subjects to the selected curriculum.
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
- **Continuous blocks:** Each assignment uses one block per meeting (no splitting). For non‑3‑unit subjects, the scheduler places a single block of up to 3 hours per session (e.g. 2‑unit lecture = one 2 hr block; 3‑unit lab = one 3 hr block per session). Lab separation: if two 3‑hr labs on the same day, at least 1 hr break between.

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

- **Subjects page:** Row action "Set prioritized faculty" opens a modal that:
  - Fetches `GET /subjects/:id/prioritized-faculty` and `GET /users?role=FACULTY`.
  - Shows an ordered list of prioritized faculty (move up/down, remove) and an "Add faculty" select.
  - Save calls `PUT /subjects/:id/prioritized-faculty` with the ordered `facultyIds`.

---

### 10. Curriculum Builder (Drag-and-Drop)

**Goal**

- On the Curriculum page, for a selected curriculum, build the curriculum by dragging subjects from a pool into year-level drop zones (Year 1 … Year 5, Ungrouped).

**Route & access**

- Route: `/curriculum/:id/build`. Protected: ADMIN, CHAIRMAN only.
- Entry: Curriculum list row dropdown → "Build" (when `canEdit`).

**Page: CurriculumBuildPage**

- **Left:** Subject pool — subjects not in this curriculum (`curriculumId !== selected id`). Each item is draggable. The pool area is also a droppable zone: dropping a subject from the tree here removes it from the curriculum (`PATCH /subjects/:id` with `curriculumId: null`, `yearLevel: null`).
- **Right:** Curriculum tree — droppable zones for **Year 1** … **Year 5** and **Ungrouped** (yearLevel null). Each zone lists subjects in that year; subjects in the tree are draggable so they can be moved between years.
- **Data:** Loads `GET /curriculum/:id`, `GET /curriculum/:id/subjects`, `GET /subjects`. Pool = filter all subjects by `curriculumId !== curriculumId`.
- **Drop handling:** Uses `@dnd-kit` (DndContext, useDraggable, useDroppable). On drop:
  - Onto pool → remove from curriculum (PATCH with nulls).
  - Onto year N or Ungrouped → PATCH `/subjects/:id` with `curriculumId` and `yearLevel` (null for Ungrouped).
- Single curriculum per subject: adding to a curriculum = moving the subject (no cloning).

---

### 11. Add/Edit Subject Dialog (No Code Input)

**Behavior**

- **Add subject:** No "Code" input. Code is auto-generated from the subject name: spaces → hyphens, non-alphanumeric removed, uppercased, trimmed to 32 chars (e.g. "Engineering Mathematics I" → `ENGINEERING-MATHEMATICS-I`). Fallback if empty: `SUB-<timestamp>`.
- **Edit subject:** Code is not editable. The existing code is shown as read-only text (e.g. "Code: MATH101"). Update payload does not send `code`, so the stored code is unchanged.
- Table still shows the Code column for identification.


