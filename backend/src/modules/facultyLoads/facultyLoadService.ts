import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import { checkConflicts, assertNoConflicts } from "./conflictService.js";
import type {
  CreateFacultyLoadBody,
  UpdateFacultyLoadBody,
  PreviewFacultyLoadBody,
  CopyFromPreviousFacultyLoadBody,
} from "./facultyLoadSchemas.js";

export interface ListFacultyLoadsQuery {
  facultyId?: string;
  roomId?: string;
  studentClassId?: string;
  academicYearId?: string;
  semester?: number;
}

export async function listFacultyLoads(query: ListFacultyLoadsQuery) {
  const where: {
    facultyId?: string;
    roomId?: string;
    studentClassId?: string;
    academicYearId?: string;
    semester?: number;
  } = {};
  if (query.facultyId) where.facultyId = query.facultyId;
  if (query.roomId) where.roomId = query.roomId;
  if (query.studentClassId) where.studentClassId = query.studentClassId;
  if (query.academicYearId) where.academicYearId = query.academicYearId;
  if (query.semester !== undefined) where.semester = query.semester;

  return prisma.facultyLoad.findMany({
    where,
    include: {
      faculty: { select: { id: true, name: true, email: true } },
      subject: { select: { id: true, code: true, name: true, units: true, isLab: true } },
      studentClass: { select: { id: true, name: true, yearLevel: true, studentCount: true } },
      room: { select: { id: true, name: true, capacity: true, isLab: true } },
      academicYear: { select: { id: true, name: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

export async function getFacultyLoadById(id: string) {
  const load = await prisma.facultyLoad.findUnique({
    where: { id },
    include: {
      faculty: { select: { id: true, name: true, email: true } },
      subject: { select: { id: true, code: true, name: true, units: true, isLab: true } },
      studentClass: { select: { id: true, name: true, yearLevel: true, studentCount: true } },
      room: { select: { id: true, name: true, capacity: true, isLab: true } },
      academicYear: { select: { id: true, name: true } },
    },
  });
  if (!load) throw notFound("Faculty load not found");
  return load;
}

/** Preview conflicts without persisting. */
export async function previewFacultyLoad(body: PreviewFacultyLoadBody) {
  return checkConflicts(body);
}

export async function createFacultyLoad(body: CreateFacultyLoadBody) {
  const conflicts = await checkConflicts(body);
  assertNoConflicts(conflicts);

  return prisma.$transaction(async (tx) => {
    const conflictsAgain = await checkConflicts(body, tx);
    assertNoConflicts(conflictsAgain);
    return tx.facultyLoad.create({
      data: body,
      include: {
        faculty: { select: { id: true, name: true, email: true } },
        subject: { select: { id: true, code: true, name: true, units: true, isLab: true } },
        studentClass: { select: { id: true, name: true, yearLevel: true, studentCount: true } },
        room: { select: { id: true, name: true, capacity: true, isLab: true } },
        academicYear: { select: { id: true, name: true } },
      },
    });
  });
}

export async function updateFacultyLoad(id: string, body: UpdateFacultyLoadBody) {
  const existing = await prisma.facultyLoad.findUnique({ where: { id } });
  if (!existing) throw notFound("Faculty load not found");

  const payload: PreviewFacultyLoadBody = {
    facultyId: body.facultyId ?? existing.facultyId,
    subjectId: body.subjectId ?? existing.subjectId,
    studentClassId: body.studentClassId ?? existing.studentClassId,
    roomId: body.roomId ?? existing.roomId,
    dayOfWeek: body.dayOfWeek ?? existing.dayOfWeek,
    startTime: body.startTime ?? existing.startTime,
    endTime: body.endTime ?? existing.endTime,
    semester: body.semester ?? existing.semester,
    academicYearId: body.academicYearId ?? existing.academicYearId,
    excludeLoadId: id,
  };

  const conflicts = await checkConflicts(payload);
  assertNoConflicts(conflicts);

  return prisma.$transaction(async (tx) => {
    const conflictsAgain = await checkConflicts(payload, tx);
    assertNoConflicts(conflictsAgain);
    return tx.facultyLoad.update({
      where: { id },
      data: {
        facultyId: body.facultyId,
        subjectId: body.subjectId,
        studentClassId: body.studentClassId,
        roomId: body.roomId,
        dayOfWeek: body.dayOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        semester: body.semester,
        academicYearId: body.academicYearId,
      },
      include: {
        faculty: { select: { id: true, name: true, email: true } },
        subject: { select: { id: true, code: true, name: true, units: true, isLab: true } },
        studentClass: { select: { id: true, name: true, yearLevel: true, studentCount: true } },
        room: { select: { id: true, name: true, capacity: true, isLab: true } },
        academicYear: { select: { id: true, name: true } },
      },
    });
  });
}

export async function deleteFacultyLoad(id: string) {
  const load = await prisma.facultyLoad.findUnique({ where: { id } });
  if (!load) throw notFound("Faculty load not found");
  await prisma.facultyLoad.delete({ where: { id } });
}

export async function resetForClass(academicYearId: string, semester: number, studentClassId: string) {
  await prisma.facultyLoad.deleteMany({
    where: { academicYearId, semester, studentClassId },
  });
}

export interface CopiedFacultyLoadSummary {
  subjectCode: string;
  subjectName: string;
  facultyName: string | null;
  roomName: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface SkippedFacultyLoadSummary extends CopiedFacultyLoadSummary {
  reason: string;
}

export interface CopyClassScheduleResult {
  copied: CopiedFacultyLoadSummary[];
  skipped: SkippedFacultyLoadSummary[];
}

export async function copyClassSchedule(body: CopyFromPreviousFacultyLoadBody): Promise<CopyClassScheduleResult> {
  const { studentClassId, sourceAcademicYearId, sourceSemester, targetAcademicYearId, targetSemester } = body;

  if (sourceAcademicYearId === targetAcademicYearId && sourceSemester === targetSemester) {
    throw badRequest("Source and target term must be different");
  }

  const sourceLoads = await prisma.facultyLoad.findMany({
    where: {
      studentClassId,
      academicYearId: sourceAcademicYearId,
      semester: sourceSemester,
    },
    include: {
      subject: { select: { code: true, name: true } },
      faculty: { select: { name: true } },
      room: { select: { name: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  if (!sourceLoads.length) {
    throw badRequest("No existing schedule found for the selected source term");
  }

  const result = await prisma.$transaction(async (tx) => {
    const copied: CopiedFacultyLoadSummary[] = [];
    const skipped: SkippedFacultyLoadSummary[] = [];

    for (const load of sourceLoads) {
      const payload: PreviewFacultyLoadBody = {
        facultyId: load.facultyId,
        subjectId: load.subjectId,
        studentClassId: load.studentClassId,
        roomId: load.roomId,
        dayOfWeek: load.dayOfWeek,
        startTime: load.startTime,
        endTime: load.endTime,
        semester: targetSemester,
        academicYearId: targetAcademicYearId,
      };

      const conflicts = await checkConflicts(payload, tx);
      const reasons: string[] = [];
      if (conflicts.facultyConflict) reasons.push("Faculty has another class at this time");
      if (conflicts.roomConflict) reasons.push("Room is already in use at this time");
      if (conflicts.studentConflict) reasons.push("Student class has another class at this time");
      if (conflicts.capacityIssue) reasons.push("Room capacity is less than class size");
      if (conflicts.labRoomMismatch) reasons.push("Lab subject must be assigned to a lab room");

      const summaryBase: CopiedFacultyLoadSummary = {
        subjectCode: load.subject.code,
        subjectName: load.subject.name,
        facultyName: load.faculty?.name ?? null,
        roomName: load.room?.name ?? null,
        dayOfWeek: load.dayOfWeek,
        startTime: load.startTime,
        endTime: load.endTime,
      };

      if (reasons.length > 0) {
        skipped.push({ ...summaryBase, reason: reasons.join("; ") });
        continue;
      }

      const created = await tx.facultyLoad.create({
        data: {
          facultyId: load.facultyId,
          subjectId: load.subjectId,
          studentClassId: load.studentClassId,
          roomId: load.roomId,
          dayOfWeek: load.dayOfWeek,
          startTime: load.startTime,
          endTime: load.endTime,
          semester: targetSemester,
          academicYearId: targetAcademicYearId,
        },
      });

      copied.push({
        subjectCode: summaryBase.subjectCode,
        subjectName: summaryBase.subjectName,
        facultyName: summaryBase.facultyName,
        roomName: summaryBase.roomName,
        dayOfWeek: created.dayOfWeek,
        startTime: created.startTime,
        endTime: created.endTime,
      });
    }

    return { copied, skipped };
  });

  return result;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface Interval {
  dayOfWeek: number;
  start: number;
  end: number;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.dayOfWeek === b.dayOfWeek && a.start < b.end && a.end > b.start;
}

function addInterval(map: Map<string, Interval[]>, key: string, interval: Interval) {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(interval);
}

function requiredMinutesForSubject(units: number, isLab: boolean): number {
  // Lectures: 1 unit = 1 hour/week. Labs: 1 unit = 3 hours/week.
  return isLab ? units * 3 * 60 : units * 60;
}

export async function autoAssignForClass(academicYearId: string, semester: number, studentClassId: string) {
  const studentClass = await prisma.studentClass.findUnique({
    where: { id: studentClassId },
    include: { curriculum: { select: { id: true, departmentId: true } } },
  });
  if (!studentClass) throw notFound("Student class not found");

  const curriculumId = studentClass.curriculumId;
  // Only auto-schedule subjects that belong to this curriculum AND this class year level.
  // \"Others\" (different yearLevel or null) are meant to be handled manually.
  const subjects = await prisma.subject.findMany({
    where: { curriculumId, yearLevel: studentClass.yearLevel },
  });
  if (!subjects.length) {
    throw badRequest("No subjects found for this curriculum");
  }

  const subjectIds = subjects.map((s) => s.id);
  const priorities = await prisma.subjectFacultyPriority.findMany({
    where: { subjectId: { in: subjectIds } },
    orderBy: { priority: "asc" },
    include: { faculty: { select: { id: true, departmentId: true } } },
  });
  const prioritiesBySubject = new Map<string, { facultyId: string; departmentId: string | null }[]>();
  for (const p of priorities) {
    if (!prioritiesBySubject.has(p.subjectId)) {
      prioritiesBySubject.set(p.subjectId, []);
    }
    prioritiesBySubject.get(p.subjectId)!.push({
      facultyId: p.facultyId,
      departmentId: p.faculty.departmentId,
    });
  }

  const allLoads = await prisma.facultyLoad.findMany({
    where: { academicYearId, semester },
  });

  const classLoads = allLoads.filter((l) => l.studentClassId === studentClassId);

  const requiredBySubject = new Map<string, number>();
  for (const s of subjects) {
    requiredBySubject.set(s.id, requiredMinutesForSubject(s.units, s.isLab));
  }

  const scheduledBySubject = new Map<string, number>();
  for (const l of classLoads) {
    const mins = timeToMinutes(l.endTime) - timeToMinutes(l.startTime);
    scheduledBySubject.set(l.subjectId, (scheduledBySubject.get(l.subjectId) ?? 0) + mins);
  }

  // Preload faculty and rooms so we can choose defaults when there is no template load.
  const faculties = await prisma.user.findMany({
    where: { role: "FACULTY" },
    select: { id: true, departmentId: true },
  });
  const rooms = await prisma.room.findMany({
    select: { id: true, name: true, capacity: true, isLab: true, departmentId: true },
  });

  // Build occupancy maps for fast conflict checks and total minutes per faculty/room.
  const facultyBusy = new Map<string, Interval[]>();
  const roomBusy = new Map<string, Interval[]>();
  const classBusy = new Map<string, Interval[]>();
  const facultyMinutes = new Map<string, number>();
  const roomMinutes = new Map<string, number>();

  for (const l of allLoads) {
    const start = timeToMinutes(l.startTime);
    const end = timeToMinutes(l.endTime);
    const mins = end - start;
    const interval: Interval = { dayOfWeek: l.dayOfWeek, start, end };
    addInterval(facultyBusy, l.facultyId, interval);
    addInterval(roomBusy, l.roomId, interval);
    addInterval(classBusy, l.studentClassId, interval);
    facultyMinutes.set(l.facultyId, (facultyMinutes.get(l.facultyId) ?? 0) + mins);
    roomMinutes.set(l.roomId, (roomMinutes.get(l.roomId) ?? 0) + mins);
  }

  const newLoads: CreateFacultyLoadBody[] = [];
  /** Subjects that could not be fully scheduled, with reason (no faculty, no room, no slot). */
  const skippedSummary: { subjectCode: string; subjectName: string; reason: string }[] = [];

  const WORK_START = 8 * 60;
  const WORK_END = 17 * 60;
  const LUNCH_START = 12 * 60;
  const LUNCH_END = 13 * 60;
  const SLOT_STEP = 15;

  const days: number[] = [1, 2, 3, 4, 5, 6];
  const MWF = [1, 3, 5];
  const TTH = [2, 4];

  function isFree(
    facultyId: string,
    roomId: string,
    dayOfWeek: number,
    startMinutes: number,
    blockMinutes: number
  ): boolean {
    const end = startMinutes + blockMinutes;
    if (startMinutes < LUNCH_END && end > LUNCH_START) return false;
    const interval: Interval = { dayOfWeek, start: startMinutes, end };
    const facultyIntervals = facultyBusy.get(facultyId) ?? [];
    const roomIntervals = roomBusy.get(roomId) ?? [];
    const classIntervals = classBusy.get(studentClassId) ?? [];
    if (facultyIntervals.some((i) => overlaps(i, interval))) return false;
    if (roomIntervals.some((i) => overlaps(i, interval))) return false;
    if (classIntervals.some((i) => overlaps(i, interval))) return false;
    return true;
  }

  function placeBlock(
    subjectId: string,
    facultyId: string,
    roomId: string,
    dayOfWeek: number,
    startMinutes: number,
    blockMinutes: number
  ): void {
    const end = startMinutes + blockMinutes;
    const interval: Interval = { dayOfWeek, start: startMinutes, end };
    const load: CreateFacultyLoadBody = {
      facultyId,
      subjectId,
      studentClassId,
      roomId,
      dayOfWeek,
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(end),
      semester,
      academicYearId,
    };
    newLoads.push(load);
    addInterval(facultyBusy, facultyId, interval);
    addInterval(roomBusy, roomId, interval);
    addInterval(classBusy, studentClassId, interval);
    facultyMinutes.set(facultyId, (facultyMinutes.get(facultyId) ?? 0) + blockMinutes);
    roomMinutes.set(roomId, (roomMinutes.get(roomId) ?? 0) + blockMinutes);
  }

  for (const s of subjects) {
    const required = requiredBySubject.get(s.id) ?? 0;
    const already = scheduledBySubject.get(s.id) ?? 0;
    let remaining = required - already;
    if (remaining <= 0) continue;

    // Choose a faculty: use prioritized faculty for this subject if any; else department + load balance.
    const subjectDeptId = s.departmentId ?? studentClass.curriculum.departmentId ?? null;
    const prioritized = prioritiesBySubject.get(s.id);
    let facultyPool: { id: string; departmentId: string | null }[];
    if (prioritized && prioritized.length > 0) {
      const prioritizedIds = new Set(prioritized.map((p) => p.facultyId));
      facultyPool = faculties.filter((f) => prioritizedIds.has(f.id));
      if (subjectDeptId != null && facultyPool.length > 1) {
        const sameDept = facultyPool.filter((f) => f.departmentId === subjectDeptId);
        if (sameDept.length > 0) facultyPool = sameDept;
      }
    } else {
      const facultyCandidates =
        subjectDeptId != null
          ? faculties.filter((f) => f.departmentId === subjectDeptId)
          : faculties;
      facultyPool = facultyCandidates.length ? facultyCandidates : faculties;
    }
    if (!facultyPool.length) {
      skippedSummary.push({ subjectCode: s.code, subjectName: s.name, reason: "No faculty available" });
      continue;
    }

    let chosenFacultyId: string;
    if (prioritized && prioritized.length > 0) {
      const byPriority = new Map(prioritized.map((p, i) => [p.facultyId, i]));
      const sorted = [...facultyPool].sort((a, b) => {
        const minsA = facultyMinutes.get(a.id) ?? 0;
        const minsB = facultyMinutes.get(b.id) ?? 0;
        if (minsA !== minsB) return minsA - minsB;
        return (byPriority.get(a.id) ?? 999) - (byPriority.get(b.id) ?? 999);
      });
      chosenFacultyId = sorted[0].id;
    } else {
      chosenFacultyId = facultyPool[0].id;
      let minFacultyMinutes = facultyMinutes.get(chosenFacultyId) ?? 0;
      for (const f of facultyPool) {
        const mins = facultyMinutes.get(f.id) ?? 0;
        if (mins < minFacultyMinutes) {
          minFacultyMinutes = mins;
          chosenFacultyId = f.id;
        }
      }
    }

    // Choose a room: capacity >= class size, lab vs non-lab, smallest total minutes.
    const classSize = studentClass.studentCount;
    const roomCandidates = rooms.filter((r) => {
      if (r.capacity < classSize) return false;
      if (s.isLab && !r.isLab) return false;
      if (!s.isLab && r.isLab) return true;
      return true;
    });
    const roomPool = roomCandidates.length ? roomCandidates : rooms;
    if (!roomPool.length) {
      skippedSummary.push({ subjectCode: s.code, subjectName: s.name, reason: "No suitable room (capacity or lab type)" });
      continue;
    }

    let chosenRoomId = roomPool[0].id;
    let minRoomMinutes = roomMinutes.get(chosenRoomId) ?? 0;
    for (const r of roomPool) {
      const mins = roomMinutes.get(r.id) ?? 0;
      if (mins < minRoomMinutes) {
        minRoomMinutes = mins;
        chosenRoomId = r.id;
      }
    }

    // 3-unit lecture: prefer MWF (3×1 hr) or TTH (2×1.5 hr); one block per meeting, not split.
    const is3UnitLecture = !s.isLab && s.units === 3 && remaining >= 180;
    if (is3UnitLecture) {
      // Try MWF: same 1hr slot on Mon, Wed, Fri
      let mwfPlaced = false;
      for (let start = WORK_START; start + 60 <= WORK_END; start += SLOT_STEP) {
        const allFree = MWF.every((d) => isFree(chosenFacultyId, chosenRoomId, d, start, 60));
        if (allFree) {
          for (const d of MWF) {
            placeBlock(s.id, chosenFacultyId, chosenRoomId, d, start, 60);
          }
          remaining -= 180;
          mwfPlaced = true;
          break;
        }
      }
      if (!mwfPlaced && remaining >= 180) {
        // Try TTH: same 1.5hr slot on Tue, Thu
        for (let start = WORK_START; start + 90 <= WORK_END; start += SLOT_STEP) {
          const allFree = TTH.every((d) => isFree(chosenFacultyId, chosenRoomId, d, start, 90));
          if (allFree) {
            for (const d of TTH) {
              placeBlock(s.id, chosenFacultyId, chosenRoomId, d, start, 90);
            }
            remaining -= 180;
            break;
          }
        }
      }
    }

    // Remaining minutes: place as single continuous blocks (one block per session, no splitting).
    // Allow up to 5 hr per block so 4- or 5-unit subjects can use a single continuous block when space allows.
    const maxBlockMinutes = 300;
    while (remaining > 0) {
      const blockMinutes = Math.min(remaining, maxBlockMinutes);
      let placed = false;

      outer: for (const day of days) {
        for (let start = WORK_START; start + blockMinutes <= WORK_END; start += SLOT_STEP) {
          if (isFree(chosenFacultyId, chosenRoomId, day, start, blockMinutes)) {
            placeBlock(s.id, chosenFacultyId, chosenRoomId, day, start, blockMinutes);
            remaining -= blockMinutes;
            placed = true;
            break outer;
          }
        }
      }

      if (!placed) break;
    }
    if (remaining > 0) {
      skippedSummary.push({ subjectCode: s.code, subjectName: s.name, reason: "No free slot for remaining minutes" });
    }
  }

  if (!newLoads.length) {
    return { assigned: [], skipped: skippedSummary };
  }

  const created = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const data of newLoads) {
      const load = await tx.facultyLoad.create({
        data,
        include: {
          faculty: { select: { id: true, name: true, email: true } },
          subject: { select: { id: true, code: true, name: true, units: true, isLab: true } },
          studentClass: { select: { id: true, name: true, yearLevel: true, studentCount: true } },
          room: { select: { id: true, name: true, capacity: true, isLab: true } },
          academicYear: { select: { id: true, name: true } },
        },
      });
      results.push(load);
    }
    return results;
  });

  const assigned = created.map((load) => ({
    subjectCode: load.subject.code,
    subjectName: load.subject.name,
    facultyName: load.faculty.name,
    roomName: load.room.name,
    dayOfWeek: load.dayOfWeek,
    startTime: load.startTime,
    endTime: load.endTime,
  }));

  return { assigned, skipped: skippedSummary };
}