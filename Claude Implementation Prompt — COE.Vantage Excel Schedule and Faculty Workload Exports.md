# Claude Implementation Prompt — COE.Vantage Excel Schedule and Faculty Workload Exports

## Objective

Implement Excel (`.xlsx`) export functionality in **COE.Vantage** for two official academic scheduling reports:

1. **Student Class Schedule** — organized by class/section.
2. **Faculty Workload Schedule** — organized by instructor.

The exported workbooks should closely reproduce the structure and formatting of the two Excel examples provided:

- Student schedule example: `BSCPE 3-B (2020 CURRICULUM)`
- Faculty workload example: `CARIÑO, ENGELBERT T.`

Use the existing project documentation in `dev.md`, the current backend and frontend implementations, and the installed dependencies as the authoritative references.

**Do not implement this as a standalone demo. Integrate it into the existing COE.Vantage application.**

---

## 1. Inspect the Existing Codebase First

Before editing any files:

1. Read `dev.md` completely, or inspect the relevant sections if the file is very large.
2. Inspect the backend and frontend `package.json` files.
3. Examine the existing report module, particularly:
   - `backend/src/modules/reports/reportService.ts`
   - The corresponding report controller and routes.
4. Inspect the existing report download implementation in `ReportsPage.tsx`, including the college workload Excel export.
5. Inspect the scheduler page, schedule data models, faculty-load models, subject/course models, class/section models, room models, and academic-year/semester selection.
6. Review the Prisma schema and existing query patterns.
7. Identify the current authorization middleware and role restrictions for reports.
8. Check the existing frontend API client, error handling, loading indicators, notifications, and button components.

The paths above are known or suggested starting points. Confirm the actual file locations and naming conventions before making changes.

### Implementation constraints

- Use the existing **ExcelJS** dependency for workbook generation.
- Reuse the existing API client and report architecture.
- Follow the project's TypeScript, Express, Prisma, React, and styling conventions.
- Do not introduce another Excel-generation library unless the existing implementation is demonstrably insufficient.
- Do not introduce duplicate routes, services, utilities, or components when equivalent functionality already exists.
- Do not change unrelated scheduling, authorization, database, or UI behavior.
- Do not modify the Prisma schema unless the feature genuinely requires it and the current schema cannot support the required report.
- Do not apply speculative schema changes or migrations.
- Do not replace existing report functionality with the new exports.
- Keep the existing college workload report working.

---

## 2. Export A: Student Class Schedule

Generate a formatted Excel worksheet for each selected class/section.

### Required columns

Preserve the following column order:

| Column | Header |
|---|---|
| A | Course Code |
| B | Course Title |
| C | Units |
| D | Time |
| E | Day |
| F | Room/Bldg. |
| G | Instructor |

### Worksheet title

Use a title containing the class/section and curriculum when that information is available.

Example:

`BSCPE 3-B (2020 CURRICULUM)`

Obtain the curriculum information from the existing database relationships. If the curriculum is not available in the current model or query, do not invent it; use the best supported class/section title.

### Row content

Each row should represent a course's scheduled assignment for the selected class/section.

Include:

- Course code.
- Course title.
- Actual course units.
- Scheduled time or times.
- Scheduled day or days.
- Room/building.
- Instructor name or names, using the existing application's display convention.

Example:

| Course Code | Course Title | Units | Time | Day | Room/Bldg. | Instructor |
|---|---|---:|---|---|---|---|
| CPE 170 | Basic Occupational Health and Safety | 3 | 2:00 - 3:00 / 2:00 - 4:00 | W/T | COE 218 / COE 215 | MFlores |
| CPE 133 | Advance Logic Circuits and Design | 1 | 2:00 - 5:00 PM | Th | COE 116 | ECariño |
| CPE 190 | Methods of Research | 2 | 2:00 - 4:00 PM | M | COE 218 | EFGalutira |

The rows above illustrate the required report layout; use actual database records for the generated workbook.

### Multiple meeting patterns

A course may have multiple meetings, different days, different time ranges, or different rooms.

- Preserve all applicable scheduled meetings.
- Follow the existing schedule model and rendering logic to determine which meetings belong together.
- Preserve the relationship between days, times, and rooms.
- Do not arbitrarily pair times and rooms by array position unless the existing data model establishes that relationship.
- Do not lose laboratory sessions, split sessions, or other distinct schedule blocks.
- Do not duplicate a course unnecessarily when multiple schedule records are intended to be represented as one course row.
- Follow the existing project's handling of team teaching and co-instructors.

### Total units

Add a final summary row:

`Total Units: [sum]`

Calculate this using the actual course units represented in the class schedule. Do not apply the faculty laboratory workload multiplier to student course units.

The total must not be inflated simply because a course has multiple meeting blocks or multiple instructors.

Confirm the appropriate deduplication rule from the existing data model before implementing the total.

---

## 3. Export B: Faculty Workload Schedule

Generate a formatted Excel worksheet for each selected faculty member.

### Faculty header

Include the available faculty information shown in the sample:

- Faculty full name.
- Employment status, appointment, or rank when available.
- Other relevant faculty information only when supported by the existing schema.

Example:

`CARIÑO, ENGELBERT T.`

`Contractual, TL`

Do not invent missing faculty details.

### Required teaching assignment fields

Preserve the column order and additional columns present in the faculty workload template whenever the original workbook or existing report implementation provides them.

The sample includes:

- Subject/course code.
- Subject/course title.
- Class/section.
- Any existing component or grouping field.
- Time.
- Meeting days.
- Room.
- Subject units.
- Workload-related values and summary totals.

Do not omit workload columns merely because their calculation is not yet understood. Inspect the existing reports and source workbook, if available, before deciding which fields to include.

### Faculty workload rules

**Critical business rule: A laboratory subject's 1 unit is equivalent to 3 units in the faculty's total load.**

For workload calculations:

- Lecture subject: credited load = actual subject units.
- Laboratory subject: credited load = actual subject units × 3.

Examples:

| Subject type | Actual units | Credited faculty load |
|---|---:|---:|
| Lecture | 3 | 3 |
| Laboratory | 1 | 3 |
| Laboratory | 2 | 6 |
| Laboratory | 3 | 9 |

Conceptually:

```ts
creditedLoad = isLaboratory
  ? actualUnits * 3
  : actualUnits;
```

Adapt this example to the actual TypeScript types and field names. Do not assume that the database uses a property named `isLaboratory`; inspect the existing schema and use the established field that identifies laboratory subjects.

### Important distinction

Keep these two values conceptually separate:

1. **Actual subject units** — the units displayed in the student class schedule.
2. **Credited faculty workload** — the value used when calculating the instructor's total teaching load.

Do not overwrite the original course units with the calculated faculty workload.

### Faculty total calculations

- Sum credited workload according to the laboratory multiplier.
- Avoid counting the same teaching assignment more than once because it contains multiple meeting blocks.
- Avoid multiplying a subject's credited load by the number of co-instructors or schedule rows.
- Follow existing rules for team teaching, split assignments, and multiple sections.
- If the existing system stores faculty-specific workload credits, inspect those values and determine whether they already incorporate the laboratory multiplier before calculating anything again.
- Keep any separate existing totals, such as subject units, teaching hours, and other workload categories, distinct.
- Preserve the template's additional totals only when their meanings and calculation rules can be established from the existing implementation or source workbook.

**Do not guess the formulas for unexplained columns.** If a value such as `24.60`, `18.00`, or `6.60` appears in the source template, determine its meaning before reproducing its calculation.

---

## 4. Excel Formatting Requirements

Use ExcelJS to create professional, print-ready workbooks that resemble the provided samples.

Apply the following where appropriate:

- Bold, merged worksheet title cells.
- Bold column headers.
- Thin cell borders.
- Appropriate column widths.
- Centered numeric values and appropriate alignment.
- Readable fonts and row heights.
- Consistent number formats.
- Highlighted total rows, including the yellow summary row used in the faculty workload example.
- Freeze panes below the title/header rows where practical.
- Auto-filters where useful and appropriate.
- Print area and page orientation.
- Fit-to-width page setup.
- Repeating header rows on subsequent printed pages where supported.
- Appropriate worksheet names that comply with Excel's worksheet-name restrictions.

Keep the visual appearance close to the provided spreadsheet templates. Do not unnecessarily redesign the reports.

For faculty totals, apply numeric formatting that matches the existing report convention. Avoid converting numeric values to strings before writing them into Excel cells.

Where the application already has a consistent academic day abbreviation or time formatting convention, reuse it.

---

## 5. Workbook Export Options

Provide two user-facing export actions:

### A. Export Class Schedules

Export the class schedules for the selected academic year and semester.

The workbook should contain one worksheet per class/section, using the student schedule layout.

If the scheduler currently supports selecting a class/section, reuse that selection for a single-class export. If the existing interface supports exporting all classes, provide a corresponding all-classes export.

Do not introduce a separate term-selection workflow if the scheduler already provides the necessary selections.

### B. Export Faculty Workloads

Export faculty workload schedules for the selected academic year and semester.

The workbook should contain one worksheet per faculty member, using the faculty workload layout.

Reuse existing role restrictions and report authorization policies. If exporting all faculty is restricted to specific roles, preserve those restrictions. Do not expose confidential or unauthorized workload information to ordinary users.

Avoid creating a separate faculty selection interface if an appropriate one already exists.

### Worksheet naming

- Use meaningful names based on class/section or faculty name.
- Handle duplicate names.
- Replace characters prohibited by Excel.
- Respect Excel's worksheet-name length limit.
- Avoid silently overwriting an existing worksheet when names collide.

---

## 6. Backend Implementation

Integrate the new exports into the existing reports module.

Follow the established controller/service/routes architecture and existing error-handling conventions.

The implementation should:

1. Validate academic-year and semester parameters.
2. Validate any selected class or faculty identifiers.
3. Apply the application's existing authorization rules.
4. Retrieve the necessary saved schedule records and related data through Prisma.
5. Generate the appropriate ExcelJS workbook.
6. Return a valid `.xlsx` file using the correct content type and download headers.
7. Return meaningful errors using the existing API error-handling pattern.
8. Prevent unbounded or unauthorized data retrieval.
9. Avoid N+1 query patterns when loading schedule-related data.
10. Avoid duplicating the same schedule aggregation logic in multiple report services.

Suggested response headers:

```ts
res.setHeader(
  "Content-Type",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
);

res.setHeader(
  "Content-Disposition",
  'attachment; filename="class-schedules.xlsx"',
);
```

Use the actual response/download pattern already established in the project.

### Data integrity

- Export saved schedules, not transient drag-and-drop previews.
- Do not include unsaved pending changes unless the existing application explicitly defines them as official export data.
- Use the selected academic year and semester.
- Follow existing rules for active terms and schedule status.
- Do not include records from unrelated academic terms.
- Respect department-level and role-level access controls.
- Do not change scheduling conflict validation or schedule generation behavior.

---

## 7. Frontend Implementation

Integrate the export buttons into the existing scheduling/report UI.

Before choosing a page, inspect `SchedulerPage.tsx`, `ReportsPage.tsx`, and the existing navigation structure. Put the controls where they best fit the current application design.

Requirements:

- Add an **Export Class Schedules** action.
- Add an **Export Faculty Workloads** action.
- Reuse the currently selected academic year and semester.
- Reuse the project's existing Axios/API client.
- Download the response as a Blob.
- Use the server-provided filename when practical, or use a meaningful fallback filename.
- Show a loading state while generating/downloading.
- Prevent duplicate submissions during an active download.
- Show a meaningful error notification when a download fails.
- Restore the button state after success or failure.
- Follow the existing Tailwind and component conventions.
- Do not introduce a new UI library.
- Ensure the controls are responsive and accessible.

A typical Axios download uses `responseType: "blob"`, but adapt it to the existing API client's interceptors and error-handling conventions.

Do not create a second Axios instance if the project already has a shared one.

---

## 8. Testing and Validation

After implementation, run the relevant existing checks.

At minimum:

- Backend TypeScript/build checks.
- Frontend TypeScript/build checks.
- Existing tests relevant to reports and scheduling.
- Tests for the laboratory workload multiplier.
- Tests for totals not being duplicated by multiple meeting blocks.
- Tests for courses with multiple scheduled meetings.
- Tests for courses with multiple instructors.
- Tests for empty schedules.
- Tests for duplicate or invalid worksheet names.
- Tests for academic-year and semester filtering.
- Tests for unauthorized export requests.
- Tests for correct XLSX response headers and file generation.

If the project does not have a suitable testing framework for a specific case, use the existing testing conventions rather than installing an unnecessary new framework.

Do not claim that tests passed unless you actually ran them.

---

## 9. Implementation Workflow

Work incrementally.

### Phase 1 — Inspect

Report the existing report architecture, relevant Prisma relationships, current export implementation, available schedule fields, and authorization rules.

### Phase 2 — Plan

List the exact files that need to change and explain the purpose of each change.

Identify any business rules that remain ambiguous, particularly the faculty workload totals shown in the source template.

### Phase 3 — Implement

Implement both Excel exports using the current project architecture.

Prefer small, focused changes. Preserve the existing college workload export.

### Phase 4 — Validate

Run the relevant builds and tests, inspect the generated workbook structure, and verify the laboratory multiplier and summary calculations.

### Phase 5 — Summarize

Provide a concise implementation report containing:

- Files created.
- Files modified.
- New endpoints.
- Frontend controls added.
- Workbook sheets and columns.
- Faculty workload calculation rules.
- Build/test results.
- Any remaining limitations or assumptions.

---

## 10. Non-Negotiable Instructions

1. Read the existing source code before implementing.
2. Treat `dev.md`, the Prisma schema, and existing business logic as authoritative.
3. Use ExcelJS already installed in the backend.
4. Preserve the existing college workload export.
5. Generate the student schedule and faculty workload as separate report formats.
6. Apply the laboratory multiplier to **faculty credited workload only**.
7. Do not inflate student course units or count the same assignment multiple times.
8. Do not invent workload formulas for unexplained columns.
9. Do not make speculative Prisma schema changes.
10. Do not refactor unrelated parts of the application.
11. Follow the existing authorization rules.
12. Make the feature functional end-to-end, not just a visual mockup or an isolated workbook-generation example.

Begin by inspecting the existing project files and reporting your implementation plan. Then proceed with the changes using the smallest safe set of modifications.
