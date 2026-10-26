import { prisma } from "../../prisma/client.js";
import { timeToMinutes } from "../facultyLoads/facultyLoadService.js";

export type ConflictType = "faculty" | "room" | "class";

interface Side {
  loadId: string;
  subject: string;
  className: string;
  faculty: string;
  room: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleConflict {
  id: string;
  type: ConflictType;
  /** The faculty member, room or class that is double-booked. */
  entity: string;
  dayOfWeek: number;
  first: Side;
  second: Side;
}

/**
 * Scans the SAVED schedule of a term for double bookings. This is deliberately independent of the checks the
 * scheduler runs when a block is saved: it catches what slipped past them (approved cross-department requests,
 * imports, direct edits) and gives the dashboard a count it can trust.
 *
 * A faculty member, room or class conflicts with itself when two loads overlap on the same day. Two rows for the
 * same subject, class and exact time are one teaching event (co-instructors, split rooms), so they do not count
 * against the room or the class.
 */
export async function findScheduleConflicts(scopeDeptId: string | null, academicYearId: string, semester: number) {
  const loads = await prisma.facultyLoad.findMany({
    where: { academicYearId, semester },
    select: {
      id: true,
      facultyId: true,
      roomId: true,
      studentClassId: true,
      subjectId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      facultyDisplayName: true,
      roomDisplayName: true,
      subject: { select: { code: true } },
      faculty: { select: { name: true, departmentId: true } },
      room: { select: { name: true, departmentId: true } },
      studentClass: { select: { name: true, curriculum: { select: { departmentId: true } } } },
    },
  });

  type L = (typeof loads)[number];
  const side = (l: L): Side => ({
    loadId: l.id,
    subject: l.subject.code,
    className: l.studentClass.name,
    faculty: l.faculty?.name ?? l.facultyDisplayName ?? "—",
    room: l.room?.name ?? l.roomDisplayName ?? "—",
    startTime: l.startTime,
    endTime: l.endTime,
  });
  const sameEvent = (a: L, b: L) =>
    a.subjectId === b.subjectId && a.studentClassId === b.studentClassId && a.startTime === b.startTime && a.endTime === b.endTime;
  const overlaps = (a: L, b: L) =>
    timeToMinutes(a.startTime) < timeToMinutes(b.endTime) && timeToMinutes(b.startTime) < timeToMinutes(a.endTime);

  const conflicts: ScheduleConflict[] = [];
  const check = (
    type: ConflictType,
    keyOf: (l: L) => string | null,
    entityName: (l: L) => string,
    inScope: (l: L) => boolean,
    skipSameEvent: boolean
  ) => {
    const groups = new Map<string, L[]>();
    for (const l of loads) {
      const key = keyOf(l);
      if (!key) continue; // off-system faculty or room: nothing to compare against
      const k = `${key}|${l.dayOfWeek}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(l);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          if (timeToMinutes(b.startTime) >= timeToMinutes(a.endTime)) break; // sorted: nothing later can overlap a
          if (!overlaps(a, b) || (skipSameEvent && sameEvent(a, b))) continue;
          if (!inScope(a)) continue;
          conflicts.push({
            id: `${type}|${a.id}|${b.id}`,
            type,
            entity: entityName(a),
            dayOfWeek: a.dayOfWeek,
            first: side(a),
            second: side(b),
          });
        }
      }
    }
  };

  const inDept = (deptId: string | null | undefined) => !scopeDeptId || deptId === scopeDeptId;
  check("faculty", (l) => l.facultyId, (l) => l.faculty?.name ?? "—", (l) => inDept(l.faculty?.departmentId), false);
  check("room", (l) => l.roomId, (l) => l.room?.name ?? "—", (l) => inDept(l.room?.departmentId), true);
  check("class", (l) => l.studentClassId, (l) => l.studentClass.name, (l) => inDept(l.studentClass.curriculum.departmentId), true);

  return conflicts;
}

export function countConflicts(conflicts: ScheduleConflict[]) {
  return {
    total: conflicts.length,
    faculty: conflicts.filter((c) => c.type === "faculty").length,
    room: conflicts.filter((c) => c.type === "room").length,
    class: conflicts.filter((c) => c.type === "class").length,
  };
}
