# Changelog

User-facing release notes. Source of the in-app "What's new" list on the login page: `frontend/src/data/changelog.ts` (keep both in sync, and `VITE_APP_VERSION` in `frontend/.env.production`). Entries before v0.3.0 are reconstructed from git history; versions between tagged commits are best-effort.

## v0.3.5 - 2026-10-26

Deloading, workload dashboard and exports

- **Improved:** Faculty and class schedules now open on all departments for the dean, college secretary and admin, with an optional department filter. Chairmen still see only their own department.
- **Improved:** The old "College workload (Excel)" report is gone. The Reports page now starts with a "College Workload" section holding the registrar-layout class schedules and faculty workload forms.
- **Improved:** Explanatory notes across the app are now concise (?) tips beside the section or field they describe, instead of text blocks on the page.
- **New:** Deloading: record items (designations, research and other assignments) with the units they deduct from a person's maximum for a term. The allowed units become the maximum less deloading.
- **New:** Overload and underload: anyone above their allowed units is overloaded, below is underloaded, shown in red, amber and green on the dashboard, the workload view and the Faculty page.
- **New:** Faculty dashboard: a faculty member sees only their own workload, deloading and weekly schedule. Chairmen, deans and the college secretary get a My workload card too.
- **New:** Schedule conflicts: the dashboard now counts faculty, room and class double bookings found by scanning the saved schedule, with a detail view.
- **Improved:** The maximum-units check, auto-assign, the projection and the Excel workload form all use the maximum less deloading; the form fills Regular Load, OA load equivalent and Other assignments from it.
- **Improved:** The college secretary and the dean can now carry a teaching load, with a maximum and deloading like faculty.
- **New:** Export the dashboard metrics as tables: one Excel workbook with a summary and every metric, or any single detail view as Excel or CSV with its current search and filters.
- **Fixed:** Downloads now keep the file name chosen by the server instead of a generic one.
- **New:** Reload buttons on the scheduler's room availability and faculty schedule panels, to pick up changes made by others without refreshing the page.

## v0.3.4 - 2026-10-26

Repeat blocks on other days, rooms per subject

- **New:** When adding a schedule block, tick "Also repeat on" days to create the same block on more days in one save.
- **Improved:** Each ticked day is checked for faculty, room and class conflicts first, and a day with a conflict is not added.
- **New:** Opening a saved block shows the other days it repeats on. Tick a day to add it, untick one to remove it, then Update.
- **New:** Subjects can be limited to specific rooms. Auto-assign then places that subject only in those rooms; subjects with no rooms still use any available room.
- **Improved:** The Subjects page opens on the most recently added curriculum instead of all curricula.

## v0.3.3 - 2026-10-24

College Secretary

- **New:** New College Secretary role: sees the whole college like the dean (dashboard, schedules, rooms, curriculum, subjects, classes, requests) and can generate every report and Excel form, without being able to change anything.
- **Improved:** Read-only access for this role is enforced on the server, not just hidden in the screens.

## v0.3.1 - 2026-10-24

Possible subjects per semester

- **Improved:** Possible subjects to teach are now kept per academic year and semester, so planning a new semester no longer changes earlier ones.
- **New:** Copy a department's possible subjects from another term in one step.
- **Improved:** The subject picker can be limited to subjects offered this semester and to one curriculum.
- **Improved:** Auto-assign and the dashboard projection use the possible subjects of the selected term.

## v0.3.0 - 2026-10-23

Dashboard overview, Excel forms, lab load credit

- **New:** Dashboard term overview for chairmen, deans and admins: curriculum scheduled, faculty load, room use and scheduling gaps.
- **New:** Drill-down pages behind every dashboard number, with search, filters and paging.
- **New:** Projected scheduling estimate showing what could still be placed and why some subjects are blocked.
- **New:** Excel exports in the registrar's layout: class schedules and the summary of faculty workload.
- **New:** Chairmen now appear on the Faculty page and can be auto-assigned like faculty.
- **New:** Possible subjects can be picked by curriculum, and the Subjects page can be filtered by curriculum.
- **Improved:** Laboratory units now count 3x toward a faculty's load and maximum units.
- **Fixed:** Changing a load's faculty to another department now asks that department's chairman for approval.

## v0.2.3 - 2026-10-22

Auto-assign and department labels

- **Improved:** Auto-assign only uses faculty listed under a subject's possible subjects to teach.
- **Improved:** Departments show a short code, such as CPE, in faculty pickers and schedules.
- **Improved:** Faculty schedule view lists only your department's faculty, including the chairman.

## v0.2.2 - 2026-10-15

Faculty page

- **New:** Chairmen can add faculty to their department.
- **Improved:** Chairmen can change a faculty member's status and maximum units.
- **Improved:** The edit dialog is shared with the Users page.

## v0.2.1 - 2026-10-13

Rooms

- **New:** Chairmen can add rooms, with a check for rooms that already exist.
- **New:** Rooms can be opened or closed to other departments instead of being loosely controlled.
- **Improved:** Department rooms are listed separately from other rooms.
- **Improved:** When moving an overlapping schedule, the room list shows only rooms that are free.
- **Fixed:** Faculty search in the scheduler (October 12).

## v0.2.0 - 2026-04-29

Password reset and schedule views

- **New:** Forgot-password and reset-password by email.
- **Improved:** Faculty and student class schedule pages updated.
- **New:** Experimental grade module groundwork.

## v0.1.3 - 2026-03-17

Reports and faculty import

- **New:** Notice of Teaching Assignment (NOTA) PDF.
- **New:** Faculty list import with status.
- **Improved:** Refresh-token handling and sidebar navigation.

## v0.1.2 - 2026-03-12

Requests and room availability

- **New:** Requests page for cross-department assignments.
- **New:** Room availability schedule view.
- **Improved:** Searchable pickers on the Rooms and Subjects pages.

## v0.1.0 - 2026-03-12

Curriculum import

- **New:** Import a curriculum from an image, an IUSIS page or the clipboard.
- **Improved:** Production configuration for deployment.

## v0.0.8 - 2026-03-11

First deployment

- **New:** Deployed with containers and Kubernetes.
- **Improved:** Subjects are unique within a curriculum.
- **Improved:** Cross-department assignment requests and student class fixes.

## v0.0.1 - 2026-03-04

Beta

- **New:** Drag-and-drop scheduler with conflict checks and availability overlays.
- **New:** Faculty, class and room weekly schedule views.
