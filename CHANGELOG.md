# Changelog

User-facing release notes. Source of the in-app "What's new" list on the login page: `frontend/src/data/changelog.ts` (keep both in sync, and `VITE_APP_VERSION` in `frontend/.env.production`). Entries before v0.3.0 are reconstructed from git history; versions between tagged commits are best-effort.

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
