## Grade Module (Experimental) - Vertical Slice

### Scope implemented

Built the first complete vertical slice of the migrated grade module under the experimental feature gate.

### Backend (new module)

- Added Prisma models and migration:
  - `GradeSubject` (owner, optional department, grading system JSON, student compute flag)
  - `GradeSubjectViewer` (explicit sharing with optional edit permission)
  - `GradeRecord` (student identity, access code, grades JSON, maxScores JSON, computedGrade JSON)
- Added routes at `/grade-subjects`:
  - Public: `GET /grade-subjects/public/records?studentNumber&code`
  - Authenticated subject CRUD + list
  - Viewer management (`GET`, `PUT`, `DELETE`)
  - Record management (`GET`, `POST`, `PATCH`, `DELETE`, `POST /:id/records/:recordId/regenerate-code` — new access code + clears `emailSentAt`)
  - Grade compute trigger: `POST /:id/compute-grades`
- Added role/ownership/viewer access checks:
  - Admin full access
  - Owner full access
  - Shared viewers read; `canEdit` viewers can write
  - **Create subject**: `ADMIN`, `DEAN`, `CHAIRMAN`, and `FACULTY` may `POST /grade-subjects` (`OFFICER` cannot create grade subjects).

### Frontend (experimental page now functional)

- Replaced placeholder `ExperimentalGradesPage` with working UI:
  - Grade subject creation/list/delete
  - Subject record list/add/delete
  - Viewer sharing list/add/remove with `canEdit`
  - Compute grades action wired to backend endpoint
- Route remains behind experimental feature gate:
  - `/experimental/grades`

### Notes

- Compute uses `gradingSystem.categories/components/gradeKeys` and stores `computedGrade` with `finalGrade`, `breakdown`, `computedAt`, plus policy fields when configured: `passingGrade`, `letterGrade`, `remarks`, `passed` (from `gradeEquivalence` + `passingGrade` in subject settings; see `backend/src/utils/gradePolicy.ts`).
- Public lookup endpoint is now available for future student/public grade page integration.
- Prisma client regeneration on Windows may fail with engine file lock while dev server is running. **For normal local Postgres** (`DATABASE_URL=postgresql://...`), stop the API process and run **`npx prisma generate`** (full, with the query engine). Do **not** leave the client in `--no-engine` mode for that setup: the generated client then expects a Data Proxy URL (`prisma://...`) and requests fail with *Error validating datasource `db`: the URL must start with the protocol `prisma://`* (P6001). Use `npx prisma generate --no-engine` only when you intentionally use Prisma Accelerate / Data Proxy.
- Added one-off import seeder for Supabase export test data:
  - Script: `backend/scripts/importSupabaseGradeData.ts`
  - Command: `npm run grade:import-supabase`
  - Dry run: `npx tsx scripts/importSupabaseGradeData.ts --dry-run`
  - Behavior: imports from `backend/public/subjects_rows.sql` + `backend/public/records_rows.sql`, maps all grade subject ownership to `faculty1@coe.vantage`, and upserts into `GradeSubject`/`GradeRecord`.
- Added next feature pack:
  - Public grade lookup page in frontend: `/grades`
  - Public `/grades` reads `?studentNumber=&code=` on load (and after submit updates the URL) and runs lookup automatically so copied share links work without clicking **View grades**.
  - **Public grade API security (app-level):**
    - `GET /grade-subjects/public/records` and `POST /grade-subjects/public/records/:recordId/compute` are rate-limited in-process (`express-rate-limit`: lookup **80**/15m/IP, compute **30**/15m/IP). Tune in `backend/src/middleware/publicGradeRateLimit.ts`; add **nginx** limits in production as the primary throttle.
    - Set **`TRUST_PROXY=true`** in backend env when behind nginx so `req.ip` reflects the client (rate limits and logs stay accurate).
    - Public lookup **does not** return `subject.gradingSystem` JSON (formula stays server-side). Public compute response omits it as well.
    - Public compute returns **404** with the same generic message for missing `recordId`, wrong `studentNumber`/`code`, or `studentComputeEnabled` off — reduces enumeration of valid record UUIDs vs credential mismatches.
    - Query/body `studentNumber` and `code` are **trimmed**, max length **80**, and `recordId` must be a **UUID** (validated before DB work).
    - Server-generated record access codes (`newGradeRecordAccessCode` in `backend/src/utils/gradeAccessCode.ts`): **`crypto.randomInt`** — uniform **6-digit** decimal string (**000000**–**999999**, leading zeros kept). Uses the OS CSPRNG, not `Math.random`. Lookup remains **studentNumber** + **code**.
  - Login page shortcut link to public lookup
  - Subject grading settings UI (structured editor + optional JSON): **category** weights = each category's share of the **final grade** (must sum to 100). **Component** weights = split **inside** that category only (must sum to 100 per category—not the same as cross-category splits like 30% exams vs 70% outputs; those are two categories). Grade keys must match record/CSV columns. Grading settings validation/save errors show only inside the settings dialog (not the main page banner). Backend Zod: `backend/src/utils/gradingSystemSchema.ts`.
  - Backend endpoint to send access-code emails for subject records:
    - `POST /grade-subjects/:id/send-access-codes`
    - Uses SMTP when configured, otherwise logs fallback payload in dev
  - Added grade access email template helper in backend utils
  - Added next UX phase in experimental grades page:
    - Access code clipboard: table **Code** cell click copies; row actions **Copy** icon; view dialog code click + copy icon; edit dialog **Copy code** button (`navigator.clipboard` + toast).
    - Regenerate access code: Radix **Generate new access code?** dialog (not `window.confirm`) from table / view / edit; **Cancel** vs primary **Generate new code**.
    - Delete record: confirmation dialog with a fresh random 6-character code (`crypto.getRandomValues`) the user must type before **Delete record** enables (caps-insensitive input; token is A–Z/2–9 excluding ambiguous glyphs).
    - Edit existing grade records (student info, code, grades JSON, maxScores JSON)
    - Row selection checkboxes for records
    - Bulk email actions:
      - Send all access emails
      - Send selected access emails only
  - Added import + validation phase:
    - Backend bulk endpoint: `POST /grade-subjects/:id/records/import` — **replace / sync**: `deleteMany` for the subject’s records then `createMany` in one transaction (re-import is not append). Response includes **`removed`** (previous row count) and **`imported`**.
    - CSV / Sheet / Excel import paths use the same replace behavior. JSON body with `records: []` clears all records for the subject.
    - Frontend **CSV file** import uses `POST /grade-subjects/:id/records/import-csv` (multipart `file`) so parsing matches **Google Sheets** and **Excel** (single implementation in `backend/src/utils/gradeCsvImport.ts` — no duplicate browser parser). Import dialog confirms before replace.
    - JSON parse errors for `grades` / `maxScores` now include specific parse message (not generic failure)
    - CSV / sheet / Excel table rules: **`gradeCsvImport.ts`** — **Row 2** (first line after the header) is the **max-score row**: under each component column you intend to import, put a **positive number** (that component’s max). **Only** those columns become grade fields; others are ignored for grading. **Row 3+** are student rows: **blank**, **`-`**, **em dash**, or **`N/A`** cells are **not imported** (no key in `grades` — not coerced to **0**) so completion/status stays accurate; numeric **0** is stored when explicitly entered. Header aliases (`student_name`, …); **`email`** / **`code`** optional (blank code → server-generated). Metadata columns (**Course**, **Remarks**, …) stay ignored. **Computed / summary grade headers** are ignored as raw columns (alphanumeric-normalized match): e.g. **Final grade**, **Final** (single word), **Course grade**, **GWA**, **Transmuted grade** — distinct from **Final Exam** / **Finals** (raw exam components). Legacy **`Quiz_max`** / **`max_Quiz`** header columns are **not** used to define maxima anymore — maxima come **only** from row 2; `*_max` columns may still appear in files but are skipped as separate columns. If a component header (e.g. **Final Exam**) has no positive number in row 2, that column is skipped and a **warning** is added to import `errors`. Blank student rows (no name/number) after row 2 are skipped.
    - `POST /grade-subjects/:id/records` (single create): **`code` optional** in JSON — omitted or blank → same server-side generator.
  - Added next enhancement phase:
    - Public per-record grade compute endpoint: `POST /grade-subjects/public/records/:recordId/compute` (requires matching studentNumber + code and subject `studentComputeEnabled`)
    - Public grade lookup page now offers `Compute my grade` action when allowed by subject
    - CSV import UX upgraded with downloadable template and import result summary (imported/skipped/errors)
  - Google Sheets + Excel import (server-side parsing, same columns as CSV):
    - `POST /grade-subjects/:id/records/import-from-sheet` body `{ sheetUrl }` — only `docs.google.com` URLs; server builds the CSV export URL and fetches it (sheet must be viewable by link for anonymous CSV export).
    - `POST /grade-subjects/:id/records/import-excel` multipart field `file` (`.xlsx`, first worksheet) — uses `multer` memory storage (12 MB cap).
    - `POST /grade-subjects/:id/records/import-csv` multipart field `file` (`.csv`) — same `multer` cap; UTF-8 body passed to `gradeCsvImport`.
    - Shared parsers: `backend/src/utils/gradeCsvImport.ts`, `googleSheetsExportUrl.ts`, `gradeExcelImport.ts`.
    - Experimental grades UI: Google Sheet URL field + Excel file picker under bulk import. **Successful** sheet imports persist the URL in **`localStorage`** (`coe.vantage.gradeSubject.importSheetUrl.v1`, map of subject id → URL) so reopening **Import data** or switching back to that subject refills the field on this browser.
    - Import validation / HTTP failures show in the **Import records** dialog only (`importDialogError`), not the main page banner — same pattern as grading settings dialog errors.
  - Experimental grades layout: top **action bar** (compute, add record, import, grading settings, send emails, **share access**) with **dialogs** for each flow; subject line includes a **viewer count control** that opens the same Share access dialog. Main view stays subject header + records table. **Add record** and **Edit record** share the same **column / score / max** grid UI and typography (no JSON); keys default from the subject’s grade columns; **Add column** appends a key. Edit also merges keys already on that row only.
  - Experimental **records table**: dynamic **grade columns** (centered header + score cells; keys ordered by subject grading system when present, then other keys), **Email** column with optional sent timestamp, **Status** (Complete / Partial / Missing badge, `filled/total`, mini progress bar vs expected keys from grading formula or fallback to visible columns), **Final** (shading from grade-equivalence **remarks** / pass-fail, not fixed 85/70 on the numeric final), sticky **Actions**. **Score cell highlights**: vs column max (default 100) using subject **passing %** from grading settings (default 75): ≥ passing = success, within 15 points below = warning, else danger; empty muted. View dialog matches legend.
  - Horizontal scroll behavior updated so only the dynamic grade-component section scrolls while non-grade columns stay pinned: left (`select`, `student`, `number`, `email`, `code`) and right (`status`, `final`, `actions`).
  - Follow-up fix: records table now uses `table-fixed` + `border-separate` + explicit boxed sticky widths (`box-border`) so pinned columns do not overlap while scrolling grade columns.
  - Narrowed pinned table widths for denser layout: `Code` (`w-24`), `Status` (`w-24`), `Final` (`w-24`), with right sticky offset adjusted so `Status` remains aligned beside `Final` and `Actions`.
  - Added explicit visual separation before sticky `Status` (`border-l` + subtle left shadow on header/body) so the last dynamic grade component has clear spacing from the pinned status lane.
  - Added a narrow spacer column between dynamic grade components and sticky `Status` to prevent highlighted last-grade cells from visually touching/overlapping the status boundary.
  - Grade component cell highlights now use `bg-clip-content` so highlight color stays inside content bounds and does not paint across padded edges near sticky separators.
  - Added client-side records table search/filter across **identity + grade columns + maxScores + computed fields** (including stringified `breakdown` for substring match), with visible count ("showing X of Y"), filtered empty-state message, and "select all" scoped to currently filtered rows.
  - View Record **computed grade**: structured header fields plus full **category/component breakdown** table (matches server `computeFinal` shape); non-array `breakdown` falls back to formatted JSON for legacy imports.
  - **Grade equivalence (grading settings)**: Same **collapsible card** chrome as other grading-settings sections (`text-base` title + range-count badge); when expanded, grid (Min/Max/Equivalent/Remark) with dashed empty state or rows. Columns Min %, Max %, **Equivalent**, **Remark** (`PASSED` / `CND` / `FAILED` → `remarks`). **Reset to MMSU Default** loads `defaultGradeEquivalenceMmsu()`; **Use MMSU Default (No Overrides)** clears rows. API: `letter` + `remarks`; backend Zod coerces numeric `letter` in JSON to string. **Grading settings panel** re-syncs from **parsed** `gradingSystemSnapshot` when the dialog is open (avoids stale prop refs that dropped `gradeEquivalence` after save). **Save** on each grading-settings panel sends a **partial** `gradingSystem` (and **Save passing & access** also sends `studentComputeEnabled`). The server **shallow-merges** that object into the stored JSON, then validates the **merged** grading system. Advanced JSON **Apply** PATCHes `categories` + `gradeEquivalence` + optional `passingGrade` together. The page merges the PATCH response into `subjects` before `loadSubjects`. `normalizeGradingSystemFromUnknown` accepts a JSON **string** for `gradingSystem`. **Component weights** inside a category are **relative** (must sum to a positive number, not necessarily 100); preview and server `computeFinal` normalize by that sum so the weighted average matches scaling weights to total 100.
  - **Grading settings dialog**: Panel saves only persist data—the dialog stays open. **Close** at the bottom dismisses; each successful save still refreshes `loadSubjects` / `loadSubjectDetails` so props stay in sync.

---

## Experimental Features Framework Notes

### Context

This section tracks the initial experimental feature system so future chats can add more experiments without reworking auth/profile/sidebar logic.

### What was added

- **Per-user experimental preferences (backend):**
  - `User.experimentalFeatures` JSON field in Prisma and SQL migration.
  - Authenticated endpoints:
    - `GET /auth/me/experimental-features`
    - `PATCH /auth/me/experimental-features`
  - Login payload now includes normalized `user.experimentalFeatures`.

- **Shared experimental model (frontend):**
  - `ExperimentalFeaturesPreference` and `ExperimentalFeatureKey` in auth types.
  - Central feature registry at `frontend/src/features/experimental/featureCatalog.ts`.
  - First registered feature key: `gradeModule`.

- **Profile controls:**
  - `UserProfilePage` now has:
    - Global toggle: enable/disable experimental features.
    - Per-feature selection list (role-filtered).
  - Preferences are persisted via `/auth/me/experimental-features`.
  - Redux `authSlice` updates user preferences immediately for reactive UI.

- **Sidebar + route gating:**
  - Sidebar renders an **Experimental** section only when enabled features exist for the user.
  - Added reusable `ExperimentalRoute` guard for manual URL access control.
  - Added route/page: `/experimental/grades` (full experimental grade module UI; gated by preferences + `featureCatalog` roles).

### Important behavior

- If global experimental toggle is off, experimental routes are inaccessible and hidden in sidebar.
- Feature check is both:
  - **role-based** (from feature catalog `allowedRoles`), and
  - **user preference-based** (`enabled + selected feature key`).
- Current implementation is intentionally generic so adding a new experiment is mostly a catalog entry plus route/page.

---

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

### 19. Whole-College Workload Excel Report (REMOVED in v0.3.5)

> Removed: the plain `GET /reports/college-workload` export and its Reports card were replaced by the registrar-layout **College Workload** card (section 30), which counts lab units 3x and shows regular load and overload. The notes below are kept as history only.

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

- `src/components/layout/AuthLayout.tsx` is the shared layout for unauthenticated pages (`LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage`):
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

**Forgot password flow**

- Login now includes a **"Forgot password?"** link (top-right of the password field) to `/forgot-password`.
- `src/pages/forgotPassword/ForgotPasswordPage.tsx` posts `{ email }` to `POST /auth/forgot-password` and always shows a generic success message to avoid account enumeration.
- Backend route `POST /auth/forgot-password` (in `authRoutes.ts`) reuses email validation (`sendPasswordResetEmailSchema`) and calls `requestPasswordResetByEmail` in `authService.ts`.
- `requestPasswordResetByEmail` performs case-insensitive email lookup, issues a Redis token when the account exists, and sends reset email; when the account does not exist, it returns silently (same client response).
- `POST /auth/forgot-password` is intentionally **public** (no `authenticate` middleware), while `POST /auth/send-password-reset-email` remains the admin-only path.
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
  - Optional password reset + SMTP settings for emailing reset links. HTML + plain-text bodies are built in [`backend/src/utils/passwordResetEmailTemplate.ts`](backend/src/utils/passwordResetEmailTemplate.ts) and sent from [`backend/src/utils/email.ts`](backend/src/utils/email.ts).
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

### 56. University and colleges (v0.6.0)

- Tables `University` and `College` (migrations `20260614000000_university_college`, `20260614000001_college_optional`). `collegeId` is on User (null for the admin and the president), Department, Curriculum, Subject, StudentClass, Room, FacultyLoad, SchedulingRuleSet, GeOfferingSet, TermLock, CrossDepartmentLoadRequest, and on AuditLog (null = university level). The columns are optional in the database because the app fills them in; the migration put every existing record under the College of Engineering (id `...00a2`). `TermLock` and `GeOfferingSet` are unique per college, academic year and semester. Academic years stay shared by the whole university: a name exists once (case-insensitive, trash included; creating or renaming to an existing name is a 409), created by the admin or a college secretary. **The current term is per college**: `College.currentAcademicYearId` and `currentSemester` (null = not started; migration `20260615000000_college_current_term` copies the old active year to the existing college). `PUT /academic-years/current-term` takes `academicYearId` (null clears) and `semester`, plus `collegeId` for the admin; a secretary can only set their own. `AcademicYear.isActive` and `currentSemester` are no longer written; `withCurrent()` in `academicYearService.ts` overlays them on every list and on `/active` as the signed-in person's college sees them (the admin and president see a year as current when any college is on it), so the frontend and the dashboards keep reading `isActive`.
- **Isolation is automatic** (`utils/collegeScope.ts`, installed in `prisma/client.ts` with `$use`): while a person with a `collegeId` is signed in, every query on those models gets `where.collegeId` added and every new record is stamped with the college (explicit, else from its parent department, curriculum or class, else the person's, else the only college; otherwise 400 "Choose a college"). The admin and president have no college and are not filtered. The person comes from the AsyncLocalStorage actor set in `authenticate`. `runUnscoped(fn)` switches the filter off for the few cross-college reads (notifications to admins, a record's college). Seeds and scripts use their own client and set the college themselves (the seed stamps it at the end). Not filtered: nested `include`s, raw SQL, models without a `collegeId` (they are reached through scoped parents). `$use` is deprecated in Prisma 6; moving to a client extension is the upgrade path.
- **President**: role `PRESIDENT`. `authorize()` lets it through GET requests of routes that allow DEAN, and nothing else, so it reads what a dean reads across colleges and every write is a 403. `/university` (admin and president) gives the overview; `/colleges` lists (own college for everyone else), creates, renames and removes empty colleges (admin). Users and departments carry a college; an admin chooses it in the forms, everyone else adds to their own college (the API refuses another).
- **Locks per college**: `assertTermUnlocked(year, semester, collegeId?)` defaults to the person's college; callers that can be reached by the admin pass the record's college. `setTermLock` takes `collegeId` (admin) and refuses a dean or secretary naming another college. `GET /academic-years` returns only the caller's college's locks; the admin and president get all, and the Academic years page has a college picker.
- Audit: entries carry the record's college; a dean or secretary reads their college's entries plus the university-level ones.

### 57. Profile pictures and college card pictures (v0.6.1)

- Tables `UserAvatar` (userId, mimeType, size, data bytes) and `CollegeImage` (collegeId, ...) in their own tables so lists never load bytes (migration `20260616000000_avatars_and_college_images`). Uploads go through `utils/imageUpload.ts` (`singleImage` with a plain "larger than N MB" message, `uploadedImage` checks the first bytes via `sniffImageType`). Limits: avatar `AVATAR_MAX_BYTES` 1 MB, card picture `CARD_IMAGE_MAX_BYTES` 3 MB; the browser shrinks first (`resizeImage` in `utils/compressImage.ts`: avatar 256 px square, card 1200 px).
- Routes: `PATCH /users/me` (own name), `PUT` and `DELETE /users/me/avatar`, `GET /users/:id/avatar` (self, or anyone the college filter lets the caller see), all before `/users/:id`. `PUT/DELETE /colleges/:id/image` (admin, audited), `GET /colleges/:id/image` (own college, or any for the admin and president). Lists carry a version, not bytes: users get `avatarVersion` (and the login payload), colleges get `imageVersion`.
- Frontend: pictures sit behind sign-in, so `hooks/useBlobUrl.ts` fetches them with the token and caches one blob URL per path and version; `UserAvatar` and `CollegePicture` use it and fall back to initials or a tinted block. The auth slice has `setProfile` so the top bar updates at once. Name changes are not audited (audit entries copy the name at the time).

### 58. College switcher and the UNIT role (v0.6.2)

- **View-as**: the admin and president can send `X-College-Id` (the axios interceptor sends the switcher's choice, `utils/collegeView.ts`, remembered per person in localStorage). `authenticate` checks it (an existing college for the admin and president; one of `unitColleges` for a unit viewer) and puts it on the actor as `viewCollegeId`. `scopeCollegeId(actor)` = the person's own college, else the viewed one: the Prisma filter, the stamp on new records, current term and lock lookups, audit and notification scope all use it, so a record made while viewing a college belongs to it. Permission checks (who may lock, add people) still use the real `collegeId`. A bound person's header is ignored. The college list is never narrowed by the choice.
- **UNIT role** (migration `20260617000000_unit_role`: enum value, `User.unitColleges`, `User.unitAreas`): `authorize` lets it through GET requests of routes that allow DEAN (like the president), and `authorizeExact` (used by the audit log) lets neither through. The actor carries `allowedCollegeIds`, which the Prisma filter applies as `collegeId in (...)` when no single college is viewed; `/colleges`, `/university` and college pictures are limited to them. Areas: ROOMS, SCHEDULES, CURRICULUM, FACULTY, REPORTS; `UNIT_AREA_OF_ROUTE` in `authenticate` maps an API route to the areas that open it (anything else, such as academic years, notifications and the profile, is open to all). The admin sets grants in the user form; a unit viewer needs at least one college and one area.
- **Sidebar** (`components/layout/Sidebar.tsx`): data-driven groups with per-role predicates, a `CollegeSwitcher` on top (keyboard friendly, search, recents) and a college-coloured code tag on the scoped groups. `Layout` remounts the page when the viewed college changes.

### 59. Room sharing (v0.7.0)

- **Tables** (migration `20260618000000_room_sharing`): `RoomShareBlock` (a draft while `requestId` is null), `RoomShareRequest` (status PENDING_CHAIRMAN, PENDING_SECRETARY, APPROVED, REJECTED, CANCELLED), `RoomShareApproval` (one per department that owns a requested room). They hold ids only, so the service reads them across colleges with `runUnscoped`. Note `runUnscoped` must wrap an awaited call (the helper `u()` in `roomSharingService.ts` does `async () => await fn()`), because Prisma queries start when awaited.
- **Booked blocks**: an approved block is a normal `FacultyLoad` with `collegeId` = asking college and the new `hostCollegeId` = room's college. The Prisma scope filter lets a college see `collegeId = X OR hostCollegeId = X` for FacultyLoad, so the host's conflict checks and room views include guest blocks; only the owner college can edit or delete them.
- **Flow** (`modules/roomSharing`, mounted at `/room-share`): rooms open for a college once it has a `TermLock` for the term; chairmen draft (checked by `checkConflicts` plus drafts and pending requests), the secretary submits (groups by host college and term), room-department chairmen approve, then the host secretary approves last and the loads are created in one transaction after a re-check. The dean only reads and is notified. `assertNoGuestBookings` blocks unlocking while bookings or pending requests exist.
- **Frontend**: `pages/roomSharing/RoomSharingPage.tsx` (Available rooms with week strips, Drafts, Requests with the scrollable preview dialog), sidebar item under Scheduling.

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

