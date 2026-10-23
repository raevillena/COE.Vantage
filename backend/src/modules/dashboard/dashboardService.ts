import { prisma } from "../../prisma/client.js";
import { badRequest } from "../../utils/errors.js";
import { simulateProjection } from "./dashboardProjection.js";
import { getPendingCount } from "../assignmentRequests/assignmentRequestService.js";
import { creditedUnitsByFaculty, loadCurriculumProgress, loadRoomUtilization, ROOM_AVAILABLE_MINUTES } from "./dashboardProgress.js";

export interface DashboardCaller {
  id: string;
  role: string;
  departmentId: string | null;
}

const NEAR_LIMIT_RATIO = 0.9;

export type DashboardAlert = {
  id: string;
  severity: "high" | "medium" | "info";
  title: string;
  detail: string;
  count: number;
  to: string;
};

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

function scopeLabel(caller: DashboardCaller) {
  return caller.role === "CHAIRMAN" ? "Your department" : "College of Engineering";
}

/**
 * Lightweight summary for the dashboard. Aggregates on the server and returns numbers only;
 * detail lists stay on their own pages. Scoped to the caller (ADMIN/DEAN: college, CHAIRMAN: own
 * department). Not cached, so one department can never see another's numbers.
 */
export async function getDashboardSummary(caller: DashboardCaller, academicYearId: string | undefined, semester: number) {
  const scopeDeptId = caller.role === "CHAIRMAN" ? caller.departmentId : null;
  if (caller.role === "CHAIRMAN" && !scopeDeptId) throw badRequest("Chairman must belong to a department");
  if (![1, 2, 3].includes(semester)) throw badRequest("semester must be 1, 2 or 3");

  const academicYear = academicYearId
    ? await prisma.academicYear.findFirst({ where: { id: academicYearId, isDeleted: false } })
    : await prisma.academicYear.findFirst({ where: { isActive: true, isDeleted: false } });
  if (!academicYear) return { empty: true as const, context: { academicYear: null, semester, scope: scopeLabel(caller) } };
  const ayId = academicYear.id;

  const [progress, faculty, roomRows, simulation, pendingRequests] = await Promise.all([
    loadCurriculumProgress(scopeDeptId, ayId, semester),
    prisma.user.findMany({
      where: {
        isDeleted: false,
        role: { in: ["FACULTY", "CHAIRMAN", "DEAN"] },
        ...(scopeDeptId ? { departmentId: scopeDeptId } : {}),
      },
      select: { id: true, maxUnits: true },
    }),
    loadRoomUtilization(scopeDeptId, ayId, semester),
    simulateProjection(scopeDeptId, ayId, semester),
    getPendingCount({ id: caller.id, role: caller.role, departmentId: caller.departmentId }),
  ]);

  // ---- Curriculum completion ----
  let requiredTotal = 0;
  let scheduledTotal = 0;
  let remainingTotal = 0;
  let unscheduledSubjects = 0;
  let partialSubjects = 0;
  let completeSubjects = 0;
  let noEligibleFaculty = 0;
  for (const e of progress.entries) {
    const remaining = e.requiredMinutes - e.scheduledMinutes;
    requiredTotal += e.requiredMinutes;
    scheduledTotal += e.scheduledMinutes;
    remainingTotal += remaining;
    if (remaining === 0) {
      completeSubjects++;
      continue;
    }
    if (e.scheduledMinutes === 0) unscheduledSubjects++;
    else partialSubjects++;
    if (!e.hasEligibleFaculty) noEligibleFaculty++;
  }
  const classes = progress.classes;
  const classesWithNoSchedule = classes.filter((c) => !c.hasAnyLoad).length;

  // ---- Faculty utilization (credited units; lab units count 3x) ----
  const unitsByFaculty = await creditedUnitsByFaculty(ayId, semester, scopeDeptId);
  let capped = 0;
  let cappedUnits = 0;
  let cappedMax = 0;
  let over = 0;
  let near = 0;
  let withoutLoad = 0;
  for (const f of faculty) {
    const units = unitsByFaculty.get(f.id) ?? 0;
    if (units === 0) withoutLoad++;
    if (f.maxUnits == null || f.maxUnits <= 0) continue;
    capped++;
    cappedUnits += units;
    cappedMax += f.maxUnits;
    if (units > f.maxUnits) over++;
    else if (units >= f.maxUnits * NEAR_LIMIT_RATIO) near++;
  }

  // ---- Room utilization ----
  const occupiedMinutes = roomRows.reduce((sum, r) => sum + r.occupiedMinutes, 0);
  const availableMinutes = roomRows.length * ROOM_AVAILABLE_MINUTES;
  const rooms = roomRows;

  // ---- Projection (estimate): schedulable now vs. blocked, with the reason ----
  const sim = { schedulable: 0, "no-faculty": 0, "faculty-cap": 0, "no-room": 0, "no-room-hours": 0 };
  const simCount = { "no-faculty": 0, "faculty-cap": 0, "no-room": 0, "no-room-hours": 0 };
  for (const r of simulation.rows) {
    sim[r.outcome] += r.remainingMinutes;
    if (r.outcome !== "schedulable") simCount[r.outcome]++;
  }
  const blockedByLimits = simCount["faculty-cap"] + simCount["no-room"] + simCount["no-room-hours"];
  const unresolvedMinutes = remainingTotal - sim.schedulable;

  const gaps = unscheduledSubjects + partialSubjects;

  const alerts: DashboardAlert[] = [];
  if (over > 0)
    alerts.push({
      id: "faculty-over",
      severity: "high",
      title: "Faculty over their maximum units",
      detail: `${over} faculty exceed their cap this term.`,
      count: over,
      to: "/dashboard/details/faculty-workload?state=over",
    });
  if (gaps > 0)
    alerts.push({
      id: "curriculum-gaps",
      severity: "high",
      title: "Class subjects with hours left to schedule",
      detail: `${unscheduledSubjects} not scheduled, ${partialSubjects} partly scheduled.`,
      count: gaps,
      to: "/dashboard/details/scheduling-gaps",
    });
  if (pendingRequests > 0)
    alerts.push({
      id: "pending-requests",
      severity: "medium",
      title: "Cross-department requests awaiting a decision",
      detail: `${pendingRequests} pending ${pendingRequests === 1 ? "request" : "requests"}.`,
      count: pendingRequests,
      to: "/requests",
    });
  if (noEligibleFaculty > 0)
    alerts.push({
      id: "no-eligible-faculty",
      severity: "medium",
      title: "Subjects with no possible faculty set",
      detail: `${noEligibleFaculty} unscheduled class subjects cannot be auto-assigned until a faculty lists them.`,
      count: noEligibleFaculty,
      to: "/dashboard/details/scheduling-gaps?reason=no-faculty",
    });
  if (blockedByLimits > 0)
    alerts.push({
      id: "blocked-by-limits",
      severity: "medium",
      title: "Subjects that may not fit current limits",
      detail: `${simCount["faculty-cap"]} lack faculty with cap left, ${simCount["no-room"] + simCount["no-room-hours"]} lack a suitable room or room hours.`,
      count: blockedByLimits,
      to: "/dashboard/details/projection?outcome=blocked",
    });
  if (near > 0)
    alerts.push({
      id: "faculty-near",
      severity: "info",
      title: "Faculty near their maximum units",
      detail: `${near} faculty are at 90% or more of their cap.`,
      count: near,
      to: "/dashboard/details/faculty-workload?state=near",
    });
  const rank = { high: 0, medium: 1, info: 2 } as const;
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    empty: false as const,
    context: {
      academicYear: { id: academicYear.id, name: academicYear.name },
      semester,
      scope: scopeLabel(caller),
      roomWindow: "Mon-Sat, 7:00 AM-7:00 PM",
    },
    kpis: {
      curriculum: {
        percent: pct(scheduledTotal, requiredTotal),
        scheduledHours: round1(scheduledTotal / 60),
        requiredHours: round1(requiredTotal / 60),
        remainingHours: round1(remainingTotal / 60),
        completeSubjects,
        partialSubjects,
        unscheduledSubjects,
        classes: classes.length,
        classesWithNoSchedule,
      },
      faculty: {
        percent: pct(cappedUnits, cappedMax),
        assignedUnits: cappedUnits,
        maxUnits: cappedMax,
        facultyWithCap: capped,
        over,
        near,
        withoutLoad,
        total: faculty.length,
      },
      rooms: {
        percent: pct(occupiedMinutes, availableMinutes),
        occupiedHours: round1(occupiedMinutes / 60),
        availableHours: round1(availableMinutes / 60),
        rooms: rooms.length,
      },
      gaps: { count: gaps, noEligibleFaculty, pendingRequests },
    },
    projection: {
      estimate: true,
      currentPercent: pct(scheduledTotal, requiredTotal),
      projectedPercent: pct(scheduledTotal + sim.schedulable, requiredTotal),
      remainingHours: round1(remainingTotal / 60),
      schedulableHours: round1(sim.schedulable / 60),
      unresolvedHours: round1(unresolvedMinutes / 60),
      unresolved: {
        noFaculty: { subjects: simCount["no-faculty"], hours: round1(sim["no-faculty"] / 60) },
        facultyCap: { subjects: simCount["faculty-cap"], hours: round1(sim["faculty-cap"] / 60) },
        noRoom: { subjects: simCount["no-room"], hours: round1(sim["no-room"] / 60) },
        noRoomHours: { subjects: simCount["no-room-hours"], hours: round1(sim["no-room-hours"] / 60) },
      },
      note: "Estimate only. Checks faculty listed for each subject (same department, unit cap left) and rooms (capacity, lab, free weekly hours). It does not search real time slots, so actual auto-assign can place less.",
    },
    alerts: alerts.slice(0, 3),
    moreAlerts: Math.max(0, alerts.length - 3),
  };
}
