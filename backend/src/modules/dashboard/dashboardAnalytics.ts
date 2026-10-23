import { z } from "zod";
import { prisma } from "../../prisma/client.js";
import { badRequest } from "../../utils/errors.js";
import { simulateProjection } from "./dashboardProjection.js";
import type { DashboardCaller } from "./dashboardService.js";
import { creditedUnitsByFaculty, loadCurriculumProgress, loadRoomUtilization, ROOM_AVAILABLE_MINUTES } from "./dashboardProgress.js";

export const analyticsQuerySchema = z.object({
  metric: z.enum(["faculty-workload", "room-utilization", "curriculum-completion", "scheduling-gaps", "projection"]),
  academicYearId: z.string().uuid().optional(),
  semester: z.coerce.number().int().min(1).max(3).default(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
  /** faculty-workload: over | near | ok | none */
  state: z.enum(["over", "near", "ok", "none"]).optional(),
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
      const [faculty, units] = await Promise.all([
        prisma.user.findMany({
          where: {
            isDeleted: false,
            role: { in: ["FACULTY", "CHAIRMAN", "DEAN"] },
            ...(scopeDeptId ? { departmentId: scopeDeptId } : {}),
          },
          select: { id: true, name: true, role: true, status: true, maxUnits: true, department: { select: { name: true } } },
        }),
        creditedUnitsByFaculty(ayId, semester, scopeDeptId),
      ]);
      let rows = faculty.map((f) => {
        const assigned = units.get(f.id) ?? 0;
        const max = f.maxUnits && f.maxUnits > 0 ? f.maxUnits : null;
        const state: "over" | "near" | "ok" | "none" =
          assigned === 0 ? "none" : max == null ? "ok" : assigned > max ? "over" : assigned >= max * 0.9 ? "near" : "ok";
        return {
          id: f.id,
          name: f.name,
          role: f.role,
          department: f.department?.name ?? "—",
          status: f.status,
          assignedUnits: assigned,
          maxUnits: max,
          percent: max ? pct(assigned, max) : null,
          state,
        };
      });
      rows = rows.filter((r) => has(`${r.name} ${r.department}`, q) && (!query.state || r.state === query.state));
      rows.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.name.localeCompare(b.name));
      return { context, note: "Units are credited units: laboratory units count 3x.", ...paginate(rows, page, pageSize) };
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
