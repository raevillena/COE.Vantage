/**
 * Release notes shown on the login page ("What's new").
 * Newest first. Keep in sync with CHANGELOG.md at the repo root and VITE_APP_VERSION in frontend/.env.production.
 * Past entries are reconstructed from the git history; versions between tagged commits are best-effort.
 */
export type ChangeKind = "new" | "improved" | "fixed";

export interface ChangelogEntry {
  version: string;
  /** ISO date (yyyy-mm-dd) */
  date: string;
  title: string;
  changes: { kind: ChangeKind; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v0.3.5",
    date: "2026-10-26",
    title: "Deloading, workload dashboard and exports",
    changes: [
      { kind: "improved", text: "Faculty and class schedules now open on all departments for the dean, college secretary and admin, with an optional department filter. Chairmen still see only their own department." },
      { kind: "improved", text: "The old \"College workload (Excel)\" report is gone. The Reports page now starts with a \"College Workload\" section holding the registrar-layout class schedules and faculty workload forms." },
      { kind: "improved", text: "Explanatory notes across the app are now concise (?) tips beside the section or field they describe, instead of text blocks on the page." },
      { kind: "new", text: "Deloading: record items (designations, research and other assignments) with the units they deduct from a person's maximum for a term. The allowed units become the maximum less deloading." },
      { kind: "new", text: "Overload and underload: anyone above their allowed units is overloaded, below is underloaded, shown in red, amber and green on the dashboard, the workload view and the Faculty page." },
      { kind: "new", text: "Faculty dashboard: a faculty member sees only their own workload, deloading and weekly schedule. Chairmen, deans and the college secretary get a My workload card too." },
      { kind: "new", text: "Schedule conflicts: the dashboard now counts faculty, room and class double bookings found by scanning the saved schedule, with a detail view." },
      { kind: "improved", text: "The maximum-units check, auto-assign, the projection and the Excel workload form all use the maximum less deloading; the form fills Regular Load, OA load equivalent and Other assignments from it." },
      { kind: "improved", text: "The college secretary and the dean can now carry a teaching load, with a maximum and deloading like faculty." },
      { kind: "new", text: "Export the dashboard metrics as tables: one Excel workbook with a summary and every metric, or any single detail view as Excel or CSV with its current search and filters." },
      { kind: "fixed", text: "Downloads now keep the file name chosen by the server instead of a generic one." },
      { kind: "new", text: "Reload buttons on the scheduler's room availability and faculty schedule panels, to pick up changes made by others without refreshing the page." },
    ],
  },
  {
    version: "v0.3.4",
    date: "2026-10-26",
    title: "Repeat blocks on other days, rooms per subject",
    changes: [
      { kind: "new", text: "When adding a schedule block, tick \"Also repeat on\" days to create the same block on more days in one save." },
      { kind: "improved", text: "Each ticked day is checked for faculty, room and class conflicts first, and a day with a conflict is not added." },
      { kind: "new", text: "Opening a saved block shows the other days it repeats on. Tick a day to add it, untick one to remove it, then Update." },
      { kind: "new", text: "Subjects can be limited to specific rooms. Auto-assign then places that subject only in those rooms; subjects with no rooms still use any available room." },
      { kind: "improved", text: "The Subjects page opens on the most recently added curriculum instead of all curricula." },
    ],
  },
  {
    version: "v0.3.3",
    date: "2026-10-24",
    title: "College Secretary",
    changes: [
      { kind: "new", text: "New College Secretary role: sees the whole college like the dean (dashboard, schedules, rooms, curriculum, subjects, classes, requests) and can generate every report and Excel form, without being able to change anything." },
      { kind: "improved", text: "Read-only access for this role is enforced on the server, not just hidden in the screens." },
    ],
  },
  {
    version: "v0.3.1",
    date: "2026-10-24",
    title: "Possible subjects per semester",
    changes: [
      { kind: "improved", text: "Possible subjects to teach are now kept per academic year and semester, so planning a new semester no longer changes earlier ones." },
      { kind: "new", text: "Copy a department's possible subjects from another term in one step." },
      { kind: "improved", text: "The subject picker can be limited to subjects offered this semester and to one curriculum." },
      { kind: "improved", text: "Auto-assign and the dashboard projection use the possible subjects of the selected term." },
    ],
  },
  {
    version: "v0.3.0",
    date: "2026-10-23",
    title: "Dashboard overview, Excel forms, lab load credit",
    changes: [
      { kind: "new", text: "Dashboard term overview for chairmen, deans and admins: curriculum scheduled, faculty load, room use and scheduling gaps." },
      { kind: "new", text: "Drill-down pages behind every dashboard number, with search, filters and paging." },
      { kind: "new", text: "Projected scheduling estimate showing what could still be placed and why some subjects are blocked." },
      { kind: "new", text: "Excel exports in the registrar's layout: class schedules and the summary of faculty workload." },
      { kind: "new", text: "Chairmen now appear on the Faculty page and can be auto-assigned like faculty." },
      { kind: "new", text: "Possible subjects can be picked by curriculum, and the Subjects page can be filtered by curriculum." },
      { kind: "improved", text: "Laboratory units now count 3x toward a faculty's load and maximum units." },
      { kind: "fixed", text: "Changing a load's faculty to another department now asks that department's chairman for approval." },
    ],
  },
  {
    version: "v0.2.3",
    date: "2026-10-22",
    title: "Auto-assign and department labels",
    changes: [
      { kind: "improved", text: "Auto-assign only uses faculty listed under a subject's possible subjects to teach." },
      { kind: "improved", text: "Departments show a short code, such as CPE, in faculty pickers and schedules." },
      { kind: "improved", text: "Faculty schedule view lists only your department's faculty, including the chairman." },
    ],
  },
  {
    version: "v0.2.2",
    date: "2026-10-15",
    title: "Faculty page",
    changes: [
      { kind: "new", text: "Chairmen can add faculty to their department." },
      { kind: "improved", text: "Chairmen can change a faculty member's status and maximum units." },
      { kind: "improved", text: "The edit dialog is shared with the Users page." },
    ],
  },
  {
    version: "v0.2.1",
    date: "2026-10-13",
    title: "Rooms",
    changes: [
      { kind: "new", text: "Chairmen can add rooms, with a check for rooms that already exist." },
      { kind: "new", text: "Rooms can be opened or closed to other departments instead of being loosely controlled." },
      { kind: "improved", text: "Department rooms are listed separately from other rooms." },
      { kind: "improved", text: "When moving an overlapping schedule, the room list shows only rooms that are free." },
      { kind: "fixed", text: "Faculty search in the scheduler (October 12)." },
    ],
  },
  {
    version: "v0.2.0",
    date: "2026-04-29",
    title: "Password reset and schedule views",
    changes: [
      { kind: "new", text: "Forgot-password and reset-password by email." },
      { kind: "improved", text: "Faculty and student class schedule pages updated." },
      { kind: "new", text: "Experimental grade module groundwork." },
    ],
  },
  {
    version: "v0.1.3",
    date: "2026-03-17",
    title: "Reports and faculty import",
    changes: [
      { kind: "new", text: "Notice of Teaching Assignment (NOTA) PDF." },
      { kind: "new", text: "Faculty list import with status." },
      { kind: "improved", text: "Refresh-token handling and sidebar navigation." },
    ],
  },
  {
    version: "v0.1.2",
    date: "2026-03-12",
    title: "Requests and room availability",
    changes: [
      { kind: "new", text: "Requests page for cross-department assignments." },
      { kind: "new", text: "Room availability schedule view." },
      { kind: "improved", text: "Searchable pickers on the Rooms and Subjects pages." },
    ],
  },
  {
    version: "v0.1.0",
    date: "2026-03-12",
    title: "Curriculum import",
    changes: [
      { kind: "new", text: "Import a curriculum from an image, an IUSIS page or the clipboard." },
      { kind: "improved", text: "Production configuration for deployment." },
    ],
  },
  {
    version: "v0.0.8",
    date: "2026-03-11",
    title: "First deployment",
    changes: [
      { kind: "new", text: "Deployed with containers and Kubernetes." },
      { kind: "improved", text: "Subjects are unique within a curriculum." },
      { kind: "improved", text: "Cross-department assignment requests and student class fixes." },
    ],
  },
  {
    version: "v0.0.1",
    date: "2026-03-04",
    title: "Beta",
    changes: [
      { kind: "new", text: "Drag-and-drop scheduler with conflict checks and availability overlays." },
      { kind: "new", text: "Faculty, class and room weekly schedule views." },
    ],
  },
];
