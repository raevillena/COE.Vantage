# COE Vantage - developer notes (index)

Read **this index**, then open only the file for the area you are working on. The notes used to be one
1,375-line file; they now live in `docs/dev/` (moved unchanged, so old references to "dev.md section N" map to
the file below). Start every session with `docs/HANDOFF.md` (current state, open items) and `CLAUDE.md`.

| File | Lines | What is in it |
|---|---|---|
| [docs/dev/grades-module.md](docs/dev/grades-module.md) | 117 | Grade module (experimental): backend module, grade records, import/compute, subject terms and year/semester filters |
| [docs/dev/experimental-features.md](docs/dev/experimental-features.md) | 42 | The per-user experimental features framework: registry, profile toggle, sidebar, route gating |
| [docs/dev/mmsu-grade-push.md](docs/dev/mmsu-grade-push.md) | 11 | Portal Insert Grade browser extension: what it does, files, build/zip, portal facts, tests |
| [docs/dev/scheduler-grid.md](docs/dev/scheduler-grid.md) | 231 | Scheduler: dragging, resizing, pending blocks, overlays, assignment form, conflict prompt (sections 1-6) |
| [docs/dev/curriculum-and-subjects.md](docs/dev/curriculum-and-subjects.md) | 213 | Curriculum by year/semester, auto room assignment, subject-faculty priorities, curriculum builder, subject dialogs, imports (sections 7-14) |
| [docs/dev/forms-theme-auth.md](docs/dev/forms-theme-auth.md) | 219 | Form validation, theme, schedule palettes, auth and branding, removed Excel report (sections 15-20) |
| [docs/dev/terms-users-search-nav.md](docs/dev/terms-users-search-nav.md) | 175 | Copy schedule from previous term, users and faculty import, search, sidebar icons (sections 21-24) |
| [docs/dev/access-workload-roles.md](docs/dev/access-workload-roles.md) | 134 | Split schedule / team teaching, read access and scoping, workload credit, chairman as faculty, cross-department approval, exports, dashboard, roles (sections 25-34) |
| [docs/dev/features-v03-v05.md](docs/dev/features-v03-v05.md) | 163 | Smoke tests, repeat a block, subject rooms, help tips, deloading, feedback, v0.3.x-v0.5.0 features (sections 35-55) |
| [docs/dev/features-v06-v075.md](docs/dev/features-v06-v075.md) | 41 | University and colleges, profile pictures, college switcher and UNIT role, room sharing, requests, schedule hold and PDFs (sections 56-61) |
| [docs/dev/parked.md](docs/dev/parked.md) | 37 | Parked / incomplete features (resizable scheduler panels and others) |
| [docs/dev/assessments-seb-plan.md](docs/dev/assessments-seb-plan.md) | 40 | PLAN (not built): exams / quizzes / assignments with Safe Exam Browser, experimental |
| [docs/dev/platform-hardening.md](docs/dev/platform-hardening.md) | 40 | Email jobs in Redis, notification digest, login lockout and sessions, schedule share links and ICS, readiness and slow-query log |
| [docs/dev/college-deadlines.md](docs/dev/college-deadlines.md) | 35 | College deadlines set by the college secretary, read by the whole college, with configurable bell and email reminders |

## Section finder

Numbered sections of the scheduler / platform notes and the file that holds each one. Use `grep -n "^### 21" docs/dev/*.md` to jump to it.

**grades-module.md**

- Scope implemented
- Backend (new module)
- Frontend (experimental page now functional)
- Notes

**experimental-features.md**

- Context
- What was added
- Important behavior

**scheduler-grid.md**

- Context
- 1. Dragging + Moving Loads
- 2. Resizing Loads
- 3. Pending Assignments (Adding New Blocks)
- 4. Overlays: Visibility, Z‑Ordering, and Sync
- 5. Assignment Form Behavior & Selects
- 6. Conflict Prompt UX (Anchored Dialog)

**curriculum-and-subjects.md**

- 7. Curriculum by Year Level, Semester & Subject Filtering
- 8. Automatic Room Assignment (Auto-scheduler) & Reset
- 9. Subject–Faculty Prioritization (Curriculum → Subjects → Faculty)
- 10. Curriculum Builder (Drag-and-Drop)
- 11. Add/Edit Subject Dialog (No Code Input)
- 12. Import Curriculum (Image, IUSIS HTML, Clipboard)
- 13. Clear Curriculum
- 14. Schedule Grid: Subject Colors

**forms-theme-auth.md**

- 15. Forms: Validation and Labels
- 16. Theme (Light / Dark / System)
- 18. Curriculum Builder: Remove & Optimistic Updates
- 19. Whole-College Workload Excel Report (REMOVED in v0.3.5)
- 17. Schedule Color Palettes (Per User)
- 20. Auth & Branding (Login / Reset / Theme)

**terms-users-search-nav.md**

- 21. Copy Class Schedule From Previous Term
- 22. Users: Faculty Import, Status, Search & Departments: View Faculties
- 23. Search on management pages
- 24. Sidebar navigation icons

**access-workload-roles.md**

- 25. Split schedule / team teaching — UI design (minimal, opt-in)
- 26. Schedule read access + department-scoped filters
- 27. Workload credit: lab units count 3x (faculty load and max units)
- 28. Chairman / dean as faculty
- 29. Cross-department approval when editing a load's faculty
- 30. Official Excel exports (class schedules, faculty workload)
- 31. Dashboard overview (phase 1)
- 32. Changelog on the login page
- 33. Possible subjects to teach are per term
- 34. COLLEGE_SECRETARY role (read-only, college-wide)

**features-v03-v05.md**

- 35. End-to-end smoke tests (Playwright)
- 36. Repeat a block on other days
- 37. Subject rooms for auto-assign, and the Subjects page default
- 38. Reload buttons on the scheduler's bottom panels
- 39. Schedules pages: all departments for dean / secretary
- 40. Help tips: explanatory text as (?) icons
- 41. Deloading, overload / underload, faculty dashboard, conflict scan
- 42. Dashboard metrics export
- 43. Feedback / review page
- 44. Faculty scope in schedules and reports (v0.3.7)
- 45. Current term (default semester) (v0.3.7)
- 46. Dark-mode pickers and time range warning (v0.3.7)
- 47. Import GE schedule (v0.3.7)
- 48. Split a repeated subject (v0.3.7)
- 49. College GE sheet, secretary rights (v0.3.8)
- 50. Assignment panel day and time lock (fix, v0.3.9)
- 51. Split Class vs team teaching (v0.3.9)
- 52. Lecture and laboratory units (v0.4.0)
- 53. Notification bell (v0.4.1)
- 54. Semester lock
- 55. Audit log (v0.5.0)

**features-v06-v075.md**

- 56. University and colleges (v0.6.0)
- 57. Profile pictures and college card pictures (v0.6.1)
- 58. College switcher and the UNIT role (v0.6.2)
- 59. Room sharing (v0.7.0)
- 60. Waiting requests, head-count dashboard and admin Scheduler (v0.7.4)
- 61. Schedule hold, PDF timetables and teaching-role edits (v0.7.5)
- 62. Grades terms, INC, Portal Insert Grade and experimental access (v0.8.0)
- 63. Current and Scheduling Semester, curriculum specializations (v0.8.1)
- 64. Filters, pagination and grade-lookup fixes (v0.8.2)
- 65. Exam Room Reservation and the faculty menu (`docs/dev/exam-rooms.md`)

**parked.md**

- P1. Resizable Scheduler Panels (2XL Breakpoint) — PARKED

## Keeping this current

- New area or feature: add its notes to the matching `docs/dev/` file (or a new one) and add a row to the table above.
- Keep a file under about 250 lines; split by topic when it grows. Never paste narrative history, record the decision and the why.
- Open items and the next step go in `docs/HANDOFF.md`, not here.
