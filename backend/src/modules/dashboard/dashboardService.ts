import { prisma } from "../../prisma/client.js";
import { badRequest } from "../../utils/errors.js";
import { TEACHING_ROLES } from "../../utils/teachingRoles.js";
import { simulateProjection } from "./dashboardProjection.js";
import { isTeachingRole } from "../../utils/teachingRoles.js";
import { timeToMinutes } from "../facultyLoads/facultyLoadService.js";
import { loadWorkloadRows } from "./dashboardWorkload.js";
import { countConflicts, findScheduleConflicts } from "./dashboardConflicts.js";
import { getPendingCount } from "../assignmentRequests/assignmentRequestService.js";
import { creditedUnitsByFaculty, loadCurriculumProgress, loadRoomUtilization, ROOM_AVAILABLE_MINUTES } from "./dashboardProgress.js";

export interface DashboardCaller {
  id: string;
  role: string;
  departmentId: string | null;
}


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

  const [progress, workload, conflictList, roomRows, simulation, pendingRequests] = await Promise.all([
    loadCurriculumProgress(scopeDeptId, ayId, semester),
    loadWorkloadRows(scopeDeptId, ayId, semester),
    findScheduleConflicts(scopeDeptId, ayId, semester),
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

  // ---- Faculty load: assigned units against the maximum less deloading (lab units count 3x) ----
  let capped = 0;
  let cappedUnits = 0;
  let cappedMax = 0;
  let over = 0;
  let under = 0;
  let full = 0;
  let unset = 0;
  let withoutLoad = 0;
  for (const f of workload) {
    if (f.assignedUnits === 0) withoutLoad++;
    if (f.effectiveMax == null) {
      unset++;
      continue;
    }
    capped++;
    cappedUnits += f.assignedUnits;
    cappedMax += f.effectiveMax;
    if (f.state === "over") over++;
    else if (f.state === "under") under++;
    else full++;
  }
  const conflictCounts = countConflicts(conflictList);

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
  if (conflictCounts.total > 0)
    alerts.push({
      id: "conflicts",
      severity: "high",
      title: "Double-booked schedules found",
      detail: `${conflictCounts.faculty} faculty, ${conflictCounts.room} room and ${conflictCounts.class} class conflicts in the saved schedule.`,
      count: conflictCounts.total,
      to: "/dashboard/details/conflicts",
    });
  if (over > 0)
    alerts.push({
      id: "faculty-over",
      severity: "high",
      title: "Faculty with overload",
      detail: `${over} ${over === 1 ? "person has" : "people have"} more units than their maximum less deloading.`,
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
  if (under > 0)
    alerts.push({
      id: "faculty-under",
      severity: "medium",
      title: "Faculty with underload",
      detail: `${under} ${under === 1 ? "person has" : "people have"} fewer units than their maximum less deloading.`,
      count: under,
      to: "/dashboard/details/faculty-workload?state=under",
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
        assignedUnits: round1(cappedUnits),
        maxUnits: round1(cappedMax),
        facultyWithCap: capped,
        over,
        under,
        full,
        unset,
        withoutLoad,
        total: workload.length,
      },
      conflicts: conflictCounts,
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

/**
 * A person's own workload for one term: assigned units against their maximum less deloading, the deloading
 * items, and how many blocks and contact hours they teach. Never accepts a user id, so it cannot show anyone else.
 */
export async function getMyWorkload(caller: DashboardCaller, academicYearId: string | undefined, semester: number) {
  if (![1, 2, 3].includes(semester)) throw badRequest("semester must be 1, 2 or 3");
  if (!isTeachingRole(caller.role)) throw badRequest("This view is for people who carry a teaching load.");
  const academicYear = academicYearId
    ? await prisma.academicYear.findFirst({ where: { id: academicYearId, isDeleted: false } })
    : await prisma.academicYear.findFirst({ where: { isActive: true, isDeleted: false } });
  if (!academicYear) return { empty: true as const, context: { academicYear: null, semester } };

  const [rows, loads] = await Promise.all([
    loadWorkloadRows(null, academicYear.id, semester, caller.id),
    prisma.facultyLoad.findMany({
      where: { facultyId: caller.id, academicYearId: academicYear.id, semester },
      select: { subjectId: true, studentClassId: true, dayOfWeek: true, startTime: true, endTime: true },
    }),
  ]);
  const me = rows[0];
  const seen = new Set<string>();
  let minutes = 0;
  for (const l of loads) {
    const key = `${l.subjectId}|${l.studentClassId}|${l.dayOfWeek}|${l.startTime}|${l.endTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    minutes += timeToMinutes(l.endTime) - timeToMinutes(l.startTime);
  }
  const courses = new Set(loads.map((l) => `${l.subjectId}|${l.studentClassId}`)).size;
  return {
    empty: false as const,
    context: { academicYear: { id: academicYear.id, name: academicYear.name }, semester },
    person: me ? { id: me.id, name: me.name, role: me.role, status: me.status, department: me.department } : null,
    workload: me
      ? {
          assignedUnits: round1(me.assignedUnits),
          maxUnits: me.maxUnits,
          deloadTotal: me.deloadTotal,
          deloading: me.deloadItems,
          effectiveMax: me.effectiveMax,
          difference: me.difference,
          state: me.state,
          percent: me.effectiveMax ? pct(me.assignedUnits, me.effectiveMax) : null,
        }
      : null,
    teaching: { courses, blocks: seen.size, contactHours: round1(minutes / 60) },
  };
}
