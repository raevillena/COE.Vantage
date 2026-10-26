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
