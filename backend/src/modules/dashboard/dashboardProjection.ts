import { prisma } from "../../prisma/client.js";
import { TEACHING_ROLES } from "../../utils/teachingRoles.js";
import { effectiveMaxUnits, loadDeloadings } from "../../utils/deloading.js";
import { creditedLoadUnits } from "../../utils/workload.js";
import { creditedUnitsByFaculty, loadCurriculumProgress, loadRoomUtilization, ROOM_AVAILABLE_MINUTES } from "./dashboardProgress.js";

export type ProjectionOutcome = "schedulable" | "no-faculty" | "faculty-cap" | "no-room" | "no-room-hours";

export interface ProjectionRow {
  classId: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  remainingMinutes: number;
  outcome: ProjectionOutcome;
}

/**
 * Estimates how much of the remaining curriculum could be scheduled, using only counting rules
 * (no slot search, no database calls inside loops):
 *  - faculty: someone listed for the subject, in the subject's department, with enough unit cap left
 *    (a partly scheduled subject already has its faculty and units, so only unscheduled ones reserve units);
 *  - rooms: capacity fits the class, laboratory subjects need a lab room, rooms of the class's department
 *    or opened for the term, with enough free hours left in the weekly window.
 * Reservations are greedy and in class/subject order, so the answer is a plausible estimate, not a guarantee.
 */
export async function simulateProjection(scopeDeptId: string | null, academicYearId: string, semester: number) {
  const { entries } = await loadCurriculumProgress(scopeDeptId, academicYearId, semester);
  const open = entries.filter((e) => e.scheduledMinutes < e.requiredMinutes);
  if (open.length === 0) return { rows: [] as ProjectionRow[] };

  const classIds = [...new Set(open.map((e) => e.classId))];
  const subjectIds = [...new Set(open.map((e) => e.subjectId))];

  const [classes, subjects, priorities, faculty, usedUnits, rooms, openRows, subjectRoomRows] = await Promise.all([
    prisma.studentClass.findMany({
      where: { id: { in: classIds } },
      select: { id: true, studentCount: true, curriculum: { select: { departmentId: true } } },
    }),
    prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, units: true, isLab: true, lecUnits: true, labUnits: true, departmentId: true },
    }),
    prisma.subjectFacultyPriority.findMany({
      where: { subjectId: { in: subjectIds }, academicYearId, semester },
      select: { subjectId: true, facultyId: true },
    }),
    prisma.user.findMany({
      where: { isDeleted: false, role: { in: TEACHING_ROLES } },
      select: { id: true, departmentId: true, maxUnits: true },
    }),
    creditedUnitsByFaculty(academicYearId, semester, null),
    loadRoomUtilization(null, academicYearId, semester),
    prisma.roomTermAvailability.findMany({ where: { academicYearId, semester, isOpen: true }, select: { roomId: true } }),
    prisma.subjectRoom.findMany({ where: { subjectId: { in: subjectIds } }, select: { subjectId: true, roomId: true } }),
  ]);
  const allowedRoomsBySubject = new Map<string, Set<string>>();
  for (const r of subjectRoomRows) {
    if (!allowedRoomsBySubject.has(r.subjectId)) allowedRoomsBySubject.set(r.subjectId, new Set());
    allowedRoomsBySubject.get(r.subjectId)!.add(r.roomId);
  }

  const classById = new Map(classes.map((c) => [c.id, c]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const facultyById = new Map(faculty.map((f) => [f.id, f]));
  const facultyBySubject = new Map<string, string[]>();
  for (const p of priorities) {
    if (!facultyBySubject.has(p.subjectId)) facultyBySubject.set(p.subjectId, []);
    facultyBySubject.get(p.subjectId)!.push(p.facultyId);
  }
  const openRoomIds = new Set(openRows.map((r) => r.roomId));
  const deloadings = await loadDeloadings(academicYearId, semester, faculty.map((f) => f.id));
  const unitsLeft = new Map<string, number>(); // remaining cap per faculty with a cap
  for (const f of faculty) {
    const cap = effectiveMaxUnits(f.maxUnits, deloadings.get(f.id)?.total ?? 0);
    if (cap != null) unitsLeft.set(f.id, cap - (usedUnits.get(f.id) ?? 0));
  }
  const freeMinutes = new Map(rooms.map((r) => [r.id, ROOM_AVAILABLE_MINUTES - r.occupiedMinutes]));

  const rows: ProjectionRow[] = [];
  for (const e of open) {
    const cls = classById.get(e.classId);
    const subject = subjectById.get(e.subjectId);
    const remaining = e.requiredMinutes - e.scheduledMinutes;
    const base = {
      classId: e.classId,
      className: e.className,
      subjectCode: e.subjectCode,
      subjectName: e.subjectName,
      remainingMinutes: remaining,
    };
    if (!cls || !subject) {
      rows.push({ ...base, outcome: "no-faculty" });
      continue;
    }
    const ownerDeptId = subject.departmentId ?? cls.curriculum.departmentId ?? null;

    // Faculty: listed for the subject and in its department (auto-assign cannot cross departments).
    const candidates = (facultyBySubject.get(e.subjectId) ?? []).filter((id) => {
      const f = facultyById.get(id);
      return f && (ownerDeptId == null || f.departmentId === ownerDeptId);
    });
    if (candidates.length === 0) {
      rows.push({ ...base, outcome: "no-faculty" });
      continue;
    }
    const credit = creditedLoadUnits(subject);
    const needsUnits = e.scheduledMinutes === 0; // a partly scheduled subject already carries its units
    let chosenFaculty: string | null = null;
    if (needsUnits) {
      let best = -Infinity;
      for (const id of candidates) {
        const left = unitsLeft.has(id) ? unitsLeft.get(id)! : Infinity; // no cap = unlimited
        if (left >= credit && left > best) {
          best = left;
          chosenFaculty = id;
        }
      }
      if (!chosenFaculty) {
        rows.push({ ...base, outcome: "faculty-cap" });
        continue;
      }
    }

    // Rooms: reachable, big enough, lab if needed, and with enough free hours left.
    const suitable = rooms.filter(
      (r) =>
        (ownerDeptId == null || r.departmentId === ownerDeptId || openRoomIds.has(r.id)) &&
        r.capacity >= cls.studentCount &&
        (!subject.isLab || r.isLab) &&
        (!allowedRoomsBySubject.has(subject.id) || allowedRoomsBySubject.get(subject.id)!.has(r.id))
    );
    if (suitable.length === 0) {
      rows.push({ ...base, outcome: "no-room" });
      continue;
    }
    const room = suitable.reduce((a, b) => ((freeMinutes.get(b.id) ?? 0) > (freeMinutes.get(a.id) ?? 0) ? b : a));
    if ((freeMinutes.get(room.id) ?? 0) < remaining) {
      rows.push({ ...base, outcome: "no-room-hours" });
      continue;
    }

    // Reserve and count it as schedulable.
    freeMinutes.set(room.id, (freeMinutes.get(room.id) ?? 0) - remaining);
    if (chosenFaculty && unitsLeft.has(chosenFaculty)) unitsLeft.set(chosenFaculty, unitsLeft.get(chosenFaculty)! - credit);
    rows.push({ ...base, outcome: "schedulable" });
  }
  return { rows };
}
