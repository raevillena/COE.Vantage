import { prisma } from "../../prisma/client.js";
import { creditedLoadUnits } from "../../utils/workload.js";
import { requiredMinutesForSubject, timeToMinutes } from "../facultyLoads/facultyLoadService.js";

/** One required subject of one class, with how much of it is scheduled (minutes per week). */
export interface ProgressEntry {
  classId: string;
  className: string;
  curriculumName: string;
  yearLevel: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  requiredMinutes: number;
  scheduledMinutes: number;
  hasEligibleFaculty: boolean;
}

export interface ProgressClass {
  id: string;
  name: string;
  yearLevel: number;
  curriculumName: string;
  hasAnyLoad: boolean;
}

/**
 * Single source for curriculum completion, shared by the summary and the detail views.
 * Rule: a class needs the subjects of its curriculum, at its year level, offered this semester
 * (or in both); lecture units = 1 h/week, lab units = 3 h/week; co-instructors share one meeting
 * so a slot counts once; scheduled time is capped at the requirement.
 */
export async function loadCurriculumProgress(scopeDeptId: string | null, academicYearId: string, semester: number) {
  const classes = await prisma.studentClass.findMany({
    where: { isDeleted: false, ...(scopeDeptId ? { curriculum: { departmentId: scopeDeptId } } : {}) },
    select: { id: true, name: true, yearLevel: true, curriculumId: true, curriculum: { select: { name: true } } },
    orderBy: [{ name: "asc" }],
  });
  const classIds = classes.map((c) => c.id);
  const curriculumIds = [...new Set(classes.map((c) => c.curriculumId))];

  const [subjects, loads, priorities] = await Promise.all([
    curriculumIds.length
      ? prisma.subject.findMany({
          where: { isDeleted: false, curriculumId: { in: curriculumIds }, OR: [{ semester: null }, { semester }] },
          select: { id: true, code: true, name: true, units: true, isLab: true, yearLevel: true, curriculumId: true },
        })
      : [],
    classIds.length
      ? prisma.facultyLoad.findMany({
          where: { academicYearId, semester, studentClassId: { in: classIds } },
          select: { studentClassId: true, subjectId: true, dayOfWeek: true, startTime: true, endTime: true },
        })
      : [],
    prisma.subjectFacultyPriority.findMany({ select: { subjectId: true } }),
  ]);

  const seenSlots = new Set<string>();
  const scheduled = new Map<string, number>();
  for (const l of loads) {
    const slot = `${l.studentClassId}|${l.subjectId}|${l.dayOfWeek}|${l.startTime}|${l.endTime}`;
    if (seenSlots.has(slot)) continue;
    seenSlots.add(slot);
    const key = `${l.studentClassId}|${l.subjectId}`;
    scheduled.set(key, (scheduled.get(key) ?? 0) + timeToMinutes(l.endTime) - timeToMinutes(l.startTime));
  }
  const withFaculty = new Set(priorities.map((p) => p.subjectId));
  const classHasLoad = new Set(loads.map((l) => l.studentClassId));

  const entries: ProgressEntry[] = [];
  for (const cls of classes) {
    for (const s of subjects) {
      if (s.curriculumId !== cls.curriculumId || s.yearLevel !== cls.yearLevel) continue;
      const required = requiredMinutesForSubject(s.units, s.isLab);
      if (required <= 0) continue;
      entries.push({
        classId: cls.id,
        className: cls.name,
        curriculumName: cls.curriculum.name,
        yearLevel: cls.yearLevel,
        subjectId: s.id,
        subjectCode: s.code,
        subjectName: s.name,
        requiredMinutes: required,
        scheduledMinutes: Math.min(scheduled.get(`${cls.id}|${s.id}`) ?? 0, required),
        hasEligibleFaculty: withFaculty.has(s.id),
      });
    }
  }
  const progressClasses: ProgressClass[] = classes.map((c) => ({
    id: c.id,
    name: c.name,
    yearLevel: c.yearLevel,
    curriculumName: c.curriculum.name,
    hasAnyLoad: classHasLoad.has(c.id),
  }));
  return { entries, classes: progressClasses };
}

/** Room utilization window: Monday-Saturday, 07:00-19:00 (the scheduler grid's working day). */
export const ROOM_DAYS = 6;
export const ROOM_WINDOW_START = 7 * 60;
export const ROOM_WINDOW_END = 19 * 60;
export const ROOM_AVAILABLE_MINUTES = ROOM_DAYS * (ROOM_WINDOW_END - ROOM_WINDOW_START);

export interface RoomUtilizationRow {
  id: string;
  name: string;
  department: string;
  departmentId: string;
  capacity: number;
  isLab: boolean;
  occupiedMinutes: number;
}

/** Occupied minutes per room inside the window; each room booking counts once (co-instructor rows share it). */
export async function loadRoomUtilization(scopeDeptId: string | null, academicYearId: string, semester: number) {
  const [rooms, loads] = await Promise.all([
    prisma.room.findMany({
      where: { isDeleted: false, ...(scopeDeptId ? { departmentId: scopeDeptId } : {}) },
      select: { id: true, name: true, capacity: true, isLab: true, departmentId: true, department: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.facultyLoad.findMany({
      where: {
        academicYearId,
        semester,
        roomId: { not: null },
        ...(scopeDeptId ? { room: { departmentId: scopeDeptId } } : {}),
      },
      select: { roomId: true, dayOfWeek: true, startTime: true, endTime: true },
    }),
  ]);
  const seen = new Set<string>();
  const minutes = new Map<string, number>();
  for (const l of loads) {
    if (!l.roomId || l.dayOfWeek < 1 || l.dayOfWeek > ROOM_DAYS) continue;
    const slot = `${l.roomId}|${l.dayOfWeek}|${l.startTime}|${l.endTime}`;
    if (seen.has(slot)) continue;
    seen.add(slot);
    const start = Math.max(timeToMinutes(l.startTime), ROOM_WINDOW_START);
    const end = Math.min(timeToMinutes(l.endTime), ROOM_WINDOW_END);
    if (end > start) minutes.set(l.roomId, (minutes.get(l.roomId) ?? 0) + end - start);
  }
  const rows: RoomUtilizationRow[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    department: r.department.name,
    departmentId: r.departmentId,
    capacity: r.capacity,
    isLab: r.isLab,
    occupiedMinutes: minutes.get(r.id) ?? 0,
  }));
  return rows;
}

/** Credited units per faculty: each subject+class once, lab units counted 3x. */
export async function creditedUnitsByFaculty(academicYearId: string, semester: number, departmentId: string | null) {
  const loads = await prisma.facultyLoad.findMany({
    where: { academicYearId, semester, facultyId: { not: null }, ...(departmentId ? { faculty: { departmentId } } : {}) },
    select: { facultyId: true, subjectId: true, studentClassId: true, subject: { select: { units: true, isLab: true } } },
  });
  const seen = new Set<string>();
  const totals = new Map<string, number>();
  for (const l of loads) {
    if (!l.facultyId) continue;
    const key = `${l.facultyId}|${l.subjectId}|${l.studentClassId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    totals.set(l.facultyId, (totals.get(l.facultyId) ?? 0) + creditedLoadUnits(l.subject?.units ?? 0, l.subject?.isLab ?? false));
  }
  return totals;
}
