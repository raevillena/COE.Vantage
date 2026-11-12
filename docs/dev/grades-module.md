<!-- Moved unchanged from dev.md (lines 1-102, 145-151). Index: dev.md -->

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

## Grade subject terms (year + semester filters)

- A `GradeSubject` has an optional term: `academicYearId` (FK to `AcademicYear`, `ON DELETE SET NULL`) and `semester` (1 = 1st, 2 = 2nd, 3 = Mid Year). Migration `20260620000000_grade_subject_term`; existing subjects have no term until staff set one. A semester needs a year (API returns 400 otherwise); clearing the year clears the semester.
- **Staff Grades page** (`ExperimentalGradesPage`): the create form and the subject header have year + semester selects (new subjects open on the current term); the subject list has year + semester filters built from the terms that exist, plus "No term set".
- **Public lookup page** (`PublicGradesPage`): the API returns each subject's `semester` and `academicYear {id,name}` (never the grading formula). The page opens on the **latest** term that has grades (later year, then later semester), offers year and semester filters, groups all terms newest first with a "Latest" chip, and hides the filters when the student has only one term. Ordering/labels live in `utils/gradeTerm.ts`.
- Test: `smoke.spec.ts` › "grade terms".

## Grades page, import and public lookup (post v0.7.5, 2026-11-06)

- **A column exists once any record has a max or a score for it** (`gradeColumnKeys` in `ExperimentalGradesPage`; the same rule feeds Add record, the grade-keys picker and the public page's `items`). The max-score row on import is what defines a column, so blanks show as "—". Order: grading-formula items first, then the rest in natural order (Lab 2 before Lab 10). The sheet's own column order is lost (jsonb sorts keys). A formula key with no max and no scores is NOT a column: the picker flags it "no such column".
- **Table layout**: bounded box (`max-h-[min(75vh,56rem)]`, own vertical scroll) so its bottom scrollbar stays on screen; header row pinned inside it; a top scrollbar strip mirrors the table's scroll (JS); score headers are a fixed 4.5rem and wrap; student names wrap in full (many students share a name). One frozen column only (`xl:` = 1280px+): checkbox, name, Edit, a menu. Every sticky cell is a compositor layer per row, which is why 4 frozen columns made scrolling stutter. Colors: `bg-background` never existed (use `bg-surface`).
- **Grade-keys picker** (`GradeKeyPicker` in `GradingSystemSettingsPanel`): pick from the existing columns, never typed. A new component starts on the first column nothing counts yet. Advanced JSON still allows typed keys.
- **Import** (`backend/src/utils/gradeCsvImport.ts`, `gradeExcelImport.ts`): `parseGradeRecordsFromRows` looks for the header row (needs a name AND a student-number column) in the first 20 rows, so a title or schedule above it is fine; the row under it is the max scores; header names are normalised (letters and digits only). Blank-header columns and weight-only headers ("50%") are skipped silently; row numbers in messages match the sheet. Import still replaces all of a subject's records.
- **Public lookup** (`PublicGradesPage`, `attachExpectedItems` in `gradeSubjectService.ts`): each record carries `items` (the subject's columns, formula order first) so blanks show as "Missing" with their max ("Missing / 20"); scores show as "score / max". Only item names are sent, never the grading formula. The page opens on the latest term (later year, then later semester) and has year/semester filters; they show whenever any grade has a term. Rate limit: 80 lookups / 15 min / IP.
- **MMSU defaults follow the portal's rule** (its gradesheet page): 1.00-3.00 Passed, 4.00 Conditional (`CND`), 5.00 Failed; 3.00's band starts at 50%, so the default passing percent is `DEFAULT_PASSING_PERCENT = 50` in `gradingSystemModel.ts` (template, settings dialog and score-colour fallback). Changing the default does not touch stored grade tables.
- **INC for blank items** (2026-11-09): a blank is not a zero. `computeFinal` (`gradeSubjectService.ts`, mirrored in `computeFinalGradeClient.ts`) reports `missingKeys`: grading-formula items that are real columns of the subject (any record has a max or a score) but have no score on the record. Any missing item stores `{ incomplete: true, finalGrade: null, letterGrade: "INC", remarks: "INC", passed: null, missingKeys }`. A score of 0 entered on purpose is a score, so it computes as before. A formula key that is not a column at all is ignored for INC (otherwise a stale key would make a whole class INC). Shown as "INC" + "N items missing" in the staff Final column, details dialog, settings preview and the student page ("Final: INC", no Pass/Fail). Stored results only change when "Compute grades" (or the student's "Compute my grade") runs again.
- Tests: `frontend/tests/e2e/grades.spec.ts` (layout, terms, picker, import layouts, missing items, columns, MMSU defaults).

### Scroll performance (2026-11-10)
- The header row is a single sticky `<thead>` (not a sticky cell per column). The name + actions column is frozen by default again (the user prefers it and reports the stutter only in their Chrome, not in the VS Code browser, so it looks browser-specific); a "Freeze names" checkbox (shown when the table scrolls sideways, `xl` widths only, remembered in `localStorage` key `cv_grades_freeze_names`, "0" = off) turns it off. Measured (80 students x 25 columns): 11 compositor layers unfrozen, 92 frozen; frame times were steady either way in headless Chromium. Test: `grades.spec.ts` "the roster grid keeps frozen cells opaque..." covers both modes.

### Import link (2026-11-10)
- The Google Sheet link is now `GradeSubject.sheetImportUrl` (migration `20260623000000_grade_subject_sheet_url`), saved with the subject: after a successful import (server side), when the box loses focus, and when the Import dialog closes. It used to live only in this browser's `localStorage` and only after a successful import, so it vanished in another browser, after clearing site data, after a failed import, or if the stored JSON was unreadable. A link found only in local storage is shown and moved up to the server once. The public lookup never exposes it (explicit select). Test: `grades.spec.ts` "the Google Sheet link is saved with the subject...".

### Public lookup redesign (2026-11-10)
- `PublicGradesPage.tsx`: a small Vantage / MMSU College of Engineering header (logo on a light tile so it shows in dark mode), plain-language intro, the student's name and number once in a "Your results" card that also holds the term filters, the "Showing ..." status line and a count line ("N incomplete / N passed / N failed", only non-zero). Subject cards are `<article>` elements (tests locate them with `locator("article")`); on phones the final-grade block is left-aligned under the subject name. An incomplete card explains INC in one sentence. Text the tests rely on is unchanged: "Final: INC", "Incomplete — N item(s) missing", "Pass"/"Fail", "Compute my grade", "Missing", the status line.
- Direction chosen with the user: clear and calm, student-first, same blue/teal as the app (no new fonts or colours); extras NOT built: per-item score bars and a print view (offered, declined). Design skill used: `impeccable` (the project has no DESIGN.md yet).

### Access codes survive a re-import (2026-11-10)
- `importRecords` (CSV, Excel and Google Sheet imports all go through it) used to delete every record and give every student a NEW random access code unless the sheet had a Code column, so each re-import/sync silently broke every link and code already sent ("No matching records"). Now a student already in the subject (matched by student number, case-insensitive) keeps their code, email and "sent" mark; a code written in the sheet still wins; a new student gets a new code; two rows with one student number never share a code. Test: `grades.spec.ts` "students keep the access code they were sent...".
- The public lookup is rate limited to 80 requests / 15 min per IP, counted in backend memory. In dev every page load makes two requests (React StrictMode), and test runs from the same machine count too: "Too many lookup attempts" locally usually means the tests used it up; restart the backend to clear it. Behind a proxy the limiter needs `TRUST_PROXY` so it counts each student's own IP (check `k8s/backend-config.yaml`).

### Category weight = sum of its components (2026-11-10)
- In Grading settings a component's weight is now its share of the FINAL grade, and the category total is worked out (read-only) as the sum of its components; all components together should add up to 100. Before, the category weight was typed and component weights were shares inside the category, which asked for the same number twice. Code: `deriveCategoryWeights` / `toPercentOfFinal` in `gradingSystemModel.ts`, `editCategories` / `adoptCategories` in `GradingSystemSettingsPanel.tsx`.
- No data migration and no change to the maths or the stored shape (`categories[].weight` + `components[].weight`): with the category weight equal to the sum of its components, category weight x share inside the category equals the component weight. Settings saved the old way are converted when the dialog opens (component weight = category weight x share; a note says so; nothing is stored until "Save formula"), and every result stays the same (tested). A new category starts with weight 0. The advanced JSON editor still accepts the old shape; it is converted when applied.
- Test: `grades.spec.ts` "a category total is the sum of its components...".

### Rename, delete confirmation, copy a formula (2026-11-10)
- **Rename:** each subject in the Grades list has a Rename button next to Delete (dialog with name and optional code, `PATCH /grade-subjects/:id`). Access codes and records are untouched. Delete asks in an in-app dialog that names the subject and its record count.
- **Copy a formula:** in Grading settings, "Copy the formula from another subject" (only shown when another subject has a formula; `copySources` prop, `copyFormulaFrom` in `gradingSystemModel.ts`). Grade keys are matched by name against THIS subject's columns, ignoring case and spaces; a component keeps the keys that match and is **skipped** when none do, a category left empty is skipped too; weights are copied as shares of the final, so the total can fall short of 100 (the dialog says so). It only fills the editor: nothing is stored until "Save formula". Passing grade, equivalence table and student access are not copied.
- Test: `tests/e2e/gradesRenameCopy.spec.ts`.

## Import emails and access-email sending (after v0.8.2, uncommitted)
- **Import emails** (Grades toolbar): paste rows copied from a sheet (name, student number, email; header row optional, any column order). `POST /grade-subjects/:id/records/import-emails` matches by student number and changes ONLY `email` (no record created, grades and codes untouched). A changed address clears `emailSentAt`. Reports unmatched, invalid and name-differs rows. Parser: `parsePastedEmails` in `ExperimentalGradesPage.tsx`.
- **Sending** is a background job per subject (`emailJobs` in `gradeSubjectService.ts`): `POST .../send-access-codes` (`{recordIds?, resend?}`) returns the job at once, the page polls `GET .../send-access-codes/status`. One email at a time, 1.5 s apart when SMTP is configured; daily cap 400 (counted from `emailSentAt` in the last 24 h); stops after 3 failures in a row; failures listed per student and not marked sent; students already emailed are skipped unless "resend"; a second start while running gives 409. Job state is in backend memory (lost on restart).
- `utils/email.ts` uses ONE pooled transport (1 connection, 1 message/second) for all mail. Addresses at reserved example domains (example.com, *.test, *.invalid ...) are logged, never sent: tests rely on this. NOTE: `backend/.env.local` holds real Gmail SMTP settings, so a dev backend really sends to real addresses.
- Table: a green check beside the email once the access email was sent (`emailSentAt`).
- Test: `tests/e2e/gradesEmails.spec.ts`.

## One code per student, public view switch (2026-11-12, uncommitted)
- A student has ONE access code across subjects: new records and imports reuse the code the student number already has in another subject (`existingStudentCodes`); "regenerate code" changes it in all of the student's records. `publicLookup` takes student number + code as proof from any one record, then returns every subject of that student with `publicViewEnabled`. Older, different per-subject codes still work (any one unlocks all). Public compute proves the same way.
- Access emails: a student already emailed from another subject (same code, `emailSentAt`) is counted as "already sent" and skipped unless "resend"; sending marks all the student's records with that code as sent. The email text no longer names one subject.
- New `GradeSubject.publicViewEnabled` (default false for new subjects; existing ones stay visible; migrations `20260630000000_grade_public_view`, `20260630000001_grade_public_view_off_for_new`), checkbox "Let students view this subject on the public grade page" in Grade settings > Passing grade & student access. Test `gradesOneCode.spec.ts`.

