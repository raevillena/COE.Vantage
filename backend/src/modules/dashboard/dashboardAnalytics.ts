import { z } from "zod";
import { prisma } from "../../prisma/client.js";
import { badRequest } from "../../utils/errors.js";
import { TEACHING_ROLES } from "../../utils/teachingRoles.js";
import { simulateProjection } from "./dashboardProjection.js";
import { loadWorkloadRows } from "./dashboardWorkload.js";
import { findScheduleConflicts } from "./dashboardConflicts.js";
import type { DashboardCaller } from "./dashboardService.js";
import { loadCurriculumProgress, loadRoomUtilization, ROOM_AVAILABLE_MINUTES } from "./dashboardProgress.js";

export const analyticsQuerySchema = z.object({
  metric: z.enum(["faculty-workload", "room-utilization", "curriculum-completion", "scheduling-gaps", "projection", "conflicts"]),
  academicYearId: z.string().uuid().optional(),
  semester: z.coerce.number().int().min(1).max(3).default(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
  /** faculty-workload: over | under | full | unset */
  state: z.enum(["over", "under", "full", "unset"]).optional(),
  /** conflicts: faculty | room | class */
  type: z.enum(["faculty", "room", "class"]).optional(),
  /** scheduling-gaps: no-faculty | unscheduled | partial */
  reason: z.enum(["no-faculty", "unscheduled", "partial"]).optional(),
  /** curriculum-completion: incomplete | complete */
  status: z.enum(["incomplete", "complete"]).optional(),
  /** projection: schedulable | blocked | no-faculty | faculty-cap | no-room | no-room-hours */
  outcome: z.enum(["schedulable", "blocked", "no-faculty", "faculty-cap", "no-room", "no-room-hours"]).optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const has = (text: string, q?: string) => !q || text.toLowerCase().includes(q.toLowerCase());

function paginate<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  return { rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize), total, page: safePage, pageSize, pages };
}

/**
 * Detail rows behind a dashboard number, paginated on the server. Uses the same rules as the summary
 * (shared helpers) and the same scope: CHAIRMAN = own department, ADMIN/DEAN = college.
 */
export async function getDashboardAnalytics(caller: DashboardCaller, query: AnalyticsQuery) {
  const scopeDeptId = caller.role === "CHAIRMAN" ? caller.departmentId : null;
  if (caller.role === "CHAIRMAN" && !scopeDeptId) throw badRequest("Chairman must belong to a department");

  const academicYear = query.academicYearId
    ? await prisma.academicYear.findFirst({ where: { id: query.academicYearId, isDeleted: false } })
    : await prisma.academicYear.findFirst({ where: { isActive: true, isDeleted: false } });
  if (!academicYear) throw badRequest("No academic year available");
  const ayId = academicYear.id;
  const { semester, page, pageSize, q } = query;
  const context = { metric: query.metric, academicYear: { id: ayId, name: academicYear.name }, semester };

  switch (query.metric) {
    case "faculty-workload": {
      const all = await loadWorkloadRows(scopeDeptId, ayId, semester);
      let rows = all.map((f) => ({
        id: f.id,
        name: f.name,
        role: f.role,
        department: f.department,
        status: f.status,
        maxUnits: f.maxUnits,
        deloadUnits: f.deloadTotal,
        deloading: f.deloadItems.map((i) => `${i.description} (${i.units})`).join("; "),
        effectiveMax: f.effectiveMax,
        assignedUnits: round1(f.assignedUnits),
        difference: f.difference,
        percent: f.effectiveMax ? pct(f.assignedUnits, f.effectiveMax) : null,
        state: f.state,
      }));
      rows = rows.filter((r) => has(`${r.name} ${r.department}`, q) && (!query.state || r.state === query.state));
      const rank = { over: 0, under: 1, full: 2, unset: 3 } as const;
      rows.sort((a, b) => rank[a.state] - rank[b.state] || Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0) || a.name.localeCompare(b.name));
      return {
        context,
        note: "Effective maximum = maximum units less the term's deloading. Overload is above it, underload below it. Laboratory units count 3x.",
        ...paginate(rows, page, pageSize),
      };
    }

    case "conflicts": {
      const all = await findScheduleConflicts(scopeDeptId, ayId, semester);
      const rows = all
        .map((c) => ({
          id: c.id,
          type: c.type,
          entity: c.entity,
          dayOfWeek: c.dayOfWeek,
          first: `${c.first.subject} · ${c.first.className} · ${c.first.startTime}-${c.first.endTime}`,
          second: `${c.second.subject} · ${c.second.className} · ${c.second.startTime}-${c.second.endTime}`,
          detail:
            c.type === "faculty"
              ? `${c.first.room} / ${c.second.room}`
              : c.type === "room"
                ? `${c.first.faculty} / ${c.second.faculty}`
                : `${c.first.faculty} / ${c.second.faculty}`,
        }))
        .filter((r) => has(`${r.entity} ${r.first} ${r.second}`, q) && (!query.type || r.type === query.type))
        .sort((a, b) => a.type.localeCompare(b.type) || a.entity.localeCompare(b.entity) || a.dayOfWeek - b.dayOfWeek);
      return {
        context,
        note: "Found by scanning the saved schedule, independent of the checks made when a block is saved. Co-instructor rows of the same subject, class and time are not counted against the room or class.",
        ...paginate(rows, page, pageSize),
      };
    }

    case "room-utilization": {
      const roomRows = await loadRoomUtilization(scopeDeptId, ayId, semester);
      const rows = roomRows
        .map((r) => ({
          id: r.id,
          name: r.name,
          department: r.department,
          capacity: r.capacity,
          isLab: r.isLab,
          occupiedHours: round1(r.occupiedMinutes / 60),
          availableHours: round1(ROOM_AVAILABLE_MINUTES / 60),
          percent: pct(r.occupiedMinutes, ROOM_AVAILABLE_MINUTES),
        }))
        .filter((r) => has(`${r.name} ${r.department}`, q))
        .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
      return { context, note: "Window: Mon-Sat, 7:00 AM-7:00 PM. Each booking counts once.", ...paginate(rows, page, pageSize) };
    }

    case "curriculum-completion": {
      const { entries, classes } = await loadCurriculumProgress(scopeDeptId, ayId, semester);
      let rows = classes.map((c) => {
        const mine = entries.filter((e) => e.classId === c.id);
        const required = mine.reduce((s, e) => s + e.requiredMinutes, 0);
        const done = mine.reduce((s, e) => s + e.scheduledMinutes, 0);
        const incomplete = mine.filter((e) => e.scheduledMinutes < e.requiredMinutes).length;
        return {
          id: c.id,
          name: c.name,
          curriculum: c.curriculumName,
          yearLevel: c.yearLevel,
          requiredHours: round1(required / 60),
          scheduledHours: round1(done / 60),
          remainingHours: round1((required - done) / 60),
          percent: pct(done, required),
          subjects: mine.length,
          incompleteSubjects: incomplete,
        };
      });
      rows = rows.filter(
        (r) =>
          has(`${r.name} ${r.curriculum}`, q) &&
          (!query.status || (query.status === "incomplete" ? r.incompleteSubjects > 0 : r.incompleteSubjects === 0))
      );
      rows.sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name));
      return { context, note: "Lecture units count 1 hr/week, laboratory units 3 hrs/week.", ...paginate(rows, page, pageSize) };
    }

    case "scheduling-gaps": {
      const { entries } = await loadCurriculumProgress(scopeDeptId, ayId, semester);
      let rows = entries
        .filter((e) => e.scheduledMinutes < e.requiredMinutes)
        .map((e) => ({
          id: `${e.classId}|${e.subjectId}`,
          className: e.className,
          yearLevel: e.yearLevel,
          subjectCode: e.subjectCode,
          subjectName: e.subjectName,
          requiredHours: round1(e.requiredMinutes / 60),
          scheduledHours: round1(e.scheduledMinutes / 60),
          remainingHours: round1((e.requiredMinutes - e.scheduledMinutes) / 60),
          status: e.scheduledMinutes === 0 ? ("unscheduled" as const) : ("partial" as const),
          hasEligibleFaculty: e.hasEligibleFaculty,
        }));
      rows = rows.filter(
        (r) =>
          has(`${r.className} ${r.subjectCode} ${r.subjectName}`, q) &&
          (!query.reason ||
            (query.reason === "no-faculty" ? !r.hasEligibleFaculty : r.status === query.reason))
      );
      rows.sort((a, b) => a.className.localeCompare(b.className) || a.subjectCode.localeCompare(b.subjectCode));
      return { context, note: "Subjects still needing hours, from each class's curriculum for this year level and semester.", ...paginate(rows, page, pageSize) };
    }

    case "projection": {
      const { rows: sim } = await simulateProjection(scopeDeptId, ayId, semester);
      const rows = sim
        .map((r) => ({
          id: `${r.classId}|${r.subjectCode}`,
          className: r.className,
          subjectCode: r.subjectCode,
          subjectName: r.subjectName,
          remainingHours: round1(r.remainingMinutes / 60),
          outcome: r.outcome,
        }))
        .filter(
          (r) =>
            has(`${r.className} ${r.subjectCode} ${r.subjectName}`, q) &&
            (!query.outcome ||
              (query.outcome === "blocked"
                ? r.outcome !== "schedulable" && r.outcome !== "no-faculty"
                : r.outcome === query.outcome))
        )
        .sort((a, b) => a.className.localeCompare(b.className) || a.subjectCode.localeCompare(b.subjectCode));
      return {
        context,
        note: "Estimate only: counts faculty cap and room capacity / lab / free hours, not real time slots. Nothing here is saved.",
        ...paginate(rows, page, pageSize),
      };
    }
  }
}
