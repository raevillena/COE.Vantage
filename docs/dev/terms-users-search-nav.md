<!-- Moved unchanged from dev.md (lines 826-1000). Index: dev.md -->

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
