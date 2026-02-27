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
  - Shows “Drop at …” and the resulting time range while hovering over a slot.
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
- User couldn’t see availability overlays while resizing.
- Overlay loads could become stale after a resize.

**Solutions**

- **Resize behavior:**
  - Resizing is done from a bottom resize handle (`data-resize-handle`) inside each `ScheduleBlock`.
  - The handle stops pointer propagation to prevent starting a drag.
  - While dragging resize:
    - We compute end time from pointer Y, snapped to 15 minutes and clamped within grid bounds.
    - The block’s height and the time text update live using `resizePreviewEndMinutes`.
  - On mouse up:
    - If the new end time changed, we call `onLoadResize(load, { startTime, endTime })`.
    - `handleLoadResize`:
      - Updates `loads`, `roomLoads`, and `editingLoad` (if relevant).
      - Patches `/faculty-loads/:id` with the new time range.
      - On success, shows “Time updated”; on failure, reloads from API.
      - Calls `refreshOverlayForLoad(updated)` so overlay matches the new duration.

- **Showing overlay while resizing:**
  - `ScheduleGrid` now accepts `onLoadResizeStart` / `onLoadResizeEnd`.
  - When resize starts:
    - `resizingLoadId` is set.
    - `overlayFacultyId` / `overlayRoomId` are set from that load, causing overlay fetch.
  - While `resizingLoadId` is set, the `AvailabilityOverlay` renders (with faculty/room busy blocks).
  - When resize ends:
    - `resizingLoadId` is cleared.
    - If we’re **not** adding a new assignment and not dragging, we clear overlay state so it doesn’t linger.

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
    - Renders **only** when we are in the “add assignment” flow (`pendingAssignment !== null`) or while dragging/resizing an existing load.
    - Uses a dedicated color for faculty busy blocks and another for room busy blocks.
    - Is rendered **under** schedule blocks (lower z‑index) so blocks stay visually dominant.

- **Suggested free slot placement:**

  - When a faculty is selected for a pending assignment:
    - We compute the first 1‑hour free slot (Mon–Sat, 7:00–18:00) that is free for:
      - The current class (when in class view), and
      - That faculty’s schedule (from `overlayFacultyLoads`).
    - If found, we set `pendingAssignment.dayOfWeek/startTime/endTime` and show a dashed “Pending” block there.
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
    - An effect keeps `dayOfWeek`, `startTime`, and `endTime` fields in sync with the pending block while in “add new” mode (no `editingLoadId`).

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

- When selecting a faculty/room, the selects sometimes reverted to “Select faculty/room”.
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

