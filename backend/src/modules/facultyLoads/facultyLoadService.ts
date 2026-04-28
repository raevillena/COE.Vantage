import { prisma } from "../../prisma/client.js";
import { badRequest, notFound, forbidden } from "../../utils/errors.js";
import { checkConflicts, assertNoConflicts } from "./conflictService.js";

export interface CallerContext {
  role: string;
  departmentId: string | null;
}

/** If room is closed for the term, only the control department (or ADMIN/DEAN) can assign. */
async function assertRoomAssignable(
  roomId: string,
  academicYearId: string,
  semester: number,
  caller: CallerContext
): Promise<void> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { controlDepartmentId: true },
  });
  if (!room) return;
  if (!room.controlDepartmentId) return;
  const availability = await prisma.roomTermAvailability.findUnique({
    where: { roomId_academicYearId_semester: { roomId, academicYearId, semester } },
  });
  const isOpen = availability?.isOpen ?? false;
  if (isOpen) return;
  if (caller.role === "ADMIN" || caller.role === "DEAN") return;
  if (caller.role === "CHAIRMAN" && caller.departmentId === room.controlDepartmentId) return;
  throw forbidden("This room is closed for the selected term. Only the control department can assign until they open it.");
}

/** CHAIRMAN can only create/update loads for student classes in their department's curricula. */
async function assertStudentClassInDepartment(studentClassId: string, caller: CallerContext): Promise<void> {
  if (!caller || caller.role !== "CHAIRMAN" || caller.departmentId == null) return;
  const sc = await prisma.studentClass.findUnique({
    where: { id: studentClassId },
    include: { curriculum: { select: { departmentId: true } } },
  });
  if (!sc) return;
  if (sc.curriculum.departmentId !== caller.departmentId) {
    throw forbidden("You can only schedule for student classes in your department's curricula.");
  }
}
import type {
  CreateFacultyLoadBody,
  UpdateFacultyLoadBody,
  PreviewFacultyLoadBody,
  CopyFromPreviousFacultyLoadBody,
} from "./facultyLoadSchemas.js";
import {
  getConfigForAutoAssign,
  getRuleSetConfigById,
} from "../schedulingRules/schedulingRuleService.js";
import type { SchedulingRuleSetConfig } from "../schedulingRules/schedulingRuleTypes.js";

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

/** Returns total assigned units for a faculty in the given term (only in-system loads; excludeLoadId to omit one load when updating). */
export async function getFacultyAssignedUnits(
  facultyId: string,
  academicYearId: string,
  semester: number,
  excludeLoadId?: string
): Promise<number> {
  const loads = await prisma.facultyLoad.findMany({
    where: {
      facultyId,
      academicYearId,
      semester,
      ...(excludeLoadId ? { id: { not: excludeLoadId } } : {}),
    },
    include: { subject: { select: { units: true } } },
  });
  return loads.reduce((sum, l) => sum + (l.subject?.units ?? 0), 0);
}

/** Validates excludeLoadId for team teaching: same slot as proposed row, different faculty/off-system identity. */
async function assertValidCoInstructorExclude(
  excludeLoadId: string,
  proposed: {
    facultyId: string | null;
    facultyDisplayName: string | null;
    subjectId: string;
    studentClassId: string;
    roomId: string | null;
    roomDisplayName: string | null;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    semester: number;
    academicYearId: string;
  }
): Promise<void> {
  const excluded = await prisma.facultyLoad.findUnique({ where: { id: excludeLoadId } });
  if (!excluded) throw badRequest("Invalid excludeLoadId");
  const clip = (t: string) => t.trim().slice(0, 5);
  const sameSlot =
    excluded.academicYearId === proposed.academicYearId &&
    excluded.semester === proposed.semester &&
    excluded.subjectId === proposed.subjectId &&
    excluded.studentClassId === proposed.studentClassId &&
    excluded.dayOfWeek === proposed.dayOfWeek &&
    clip(excluded.startTime) === clip(proposed.startTime) &&
    clip(excluded.endTime) === clip(proposed.endTime);
  if (!sameSlot) {
    throw badRequest("excludeLoadId must refer to the same subject, class, and time as this assignment (room may differ)");
  }
  const exFac = excluded.facultyId ?? null;
  const prFac = proposed.facultyId ?? null;
  const sameInSystemFaculty = exFac != null && prFac != null && exFac === prFac;
  const exName = (excluded.facultyDisplayName?.trim().toLowerCase() ?? "") || null;
  const prName = (proposed.facultyDisplayName?.trim().toLowerCase() ?? "") || null;
  const sameOffSystemOthers = exFac == null && prFac == null && exName != null && exName === prName;
  if (sameInSystemFaculty || sameOffSystemOthers) {
    throw badRequest("Co-instructor must be a different faculty than the existing load");
  }
}

/** Normalize faculty/room payload for DB: empty string -> null; trim display names. */
function normalizeFacultyLoadData<T extends Record<string, unknown>>(data: T): T & { facultyId?: string | null; facultyDisplayName?: string | null; roomId?: string | null; roomDisplayName?: string | null } {
  const out = { ...data } as T & { facultyId?: string | null; facultyDisplayName?: string | null; roomId?: string | null; roomDisplayName?: string | null };
  if ("facultyId" in out) out.facultyId = (out.facultyId as string)?.trim() || null;
  if ("facultyDisplayName" in out) out.facultyDisplayName = (out.facultyDisplayName as string)?.trim() || null;
  if ("roomId" in out) out.roomId = (out.roomId as string)?.trim() || null;
  if ("roomDisplayName" in out) out.roomDisplayName = (out.roomDisplayName as string)?.trim() || null;
  return out;
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

export async function createFacultyLoad(body: CreateFacultyLoadBody, caller?: CallerContext) {
  const effectiveRoomId = body.roomId?.trim() || null;
  if (effectiveRoomId && caller) {
    await assertRoomAssignable(effectiveRoomId, body.academicYearId, body.semester, caller);
  }
  if (caller) await assertStudentClassInDepartment(body.studentClassId, caller);
  const effectiveFacultyId = body.facultyId?.trim() || null;
  if (effectiveFacultyId) {
    const [subject, user, currentUnits] = await Promise.all([
      prisma.subject.findUnique({ where: { id: body.subjectId }, select: { units: true } }),
      prisma.user.findUnique({ where: { id: effectiveFacultyId }, select: { maxUnits: true, name: true } }),
      getFacultyAssignedUnits(effectiveFacultyId, body.academicYearId, body.semester),
    ]);
    if (subject && user?.maxUnits != null) {
      const newTotal = currentUnits + subject.units;
      if (newTotal > user.maxUnits) {
        throw badRequest(
          `Faculty ${user.name ?? "selected"} has reached maximum units (${user.maxUnits}). Current: ${currentUnits}, this subject: ${subject.units}.`
        );
      }
    }
  }

  const trimmedRoomDisplay = body.roomDisplayName?.trim() || null;
  const trimmedFacultyDisplay = body.facultyDisplayName?.trim() || null;
  if (body.excludeLoadId) {
    await assertValidCoInstructorExclude(body.excludeLoadId, {
      facultyId: effectiveFacultyId,
      facultyDisplayName: trimmedFacultyDisplay,
      subjectId: body.subjectId,
      studentClassId: body.studentClassId,
      roomId: effectiveRoomId,
      roomDisplayName: trimmedRoomDisplay,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      semester: body.semester,
      academicYearId: body.academicYearId,
    });
  }

  const payload: PreviewFacultyLoadBody = {
    facultyId: effectiveFacultyId,
    facultyDisplayName: trimmedFacultyDisplay,
    subjectId: body.subjectId,
    studentClassId: body.studentClassId,
    roomId: effectiveRoomId,
    roomDisplayName: trimmedRoomDisplay,
    dayOfWeek: body.dayOfWeek,
    startTime: body.startTime,
    endTime: body.endTime,
    semester: body.semester,
    academicYearId: body.academicYearId,
    excludeLoadId: body.excludeLoadId,
  };
  const conflicts = await checkConflicts(payload);
  assertNoConflicts(conflicts);

  const data = normalizeFacultyLoadData({
    facultyId: body.facultyId?.trim() || null,
    facultyDisplayName: body.facultyDisplayName?.trim() || null,
    roomId: body.roomId?.trim() || null,
    roomDisplayName: body.roomDisplayName?.trim() || null,
    subjectId: body.subjectId,
    studentClassId: body.studentClassId,
    dayOfWeek: body.dayOfWeek,
    startTime: body.startTime,
    endTime: body.endTime,
    semester: body.semester,
    academicYearId: body.academicYearId,
  });

  return prisma.$transaction(async (tx) => {
    const conflictsAgain = await checkConflicts(payload, tx);
    assertNoConflicts(conflictsAgain);
    return tx.facultyLoad.create({
      data,
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

export async function updateFacultyLoad(id: string, body: UpdateFacultyLoadBody, caller?: CallerContext) {
  const existing = await prisma.facultyLoad.findUnique({ where: { id }, include: { subject: { select: { units: true } } } });
  if (!existing) throw notFound("Faculty load not found");

  if (caller) {
    const effectiveStudentClassId = body.studentClassId ?? existing.studentClassId;
    await assertStudentClassInDepartment(effectiveStudentClassId, caller);
  }

  const facultyId = body.facultyId !== undefined ? (body.facultyId?.trim() || null) : existing.facultyId;
  const facultyDisplayName = body.facultyDisplayName !== undefined ? (body.facultyDisplayName?.trim() || null) : existing.facultyDisplayName;
  const roomId = body.roomId !== undefined ? (body.roomId?.trim() || null) : existing.roomId;
  const roomDisplayName = body.roomDisplayName !== undefined ? (body.roomDisplayName?.trim() || null) : existing.roomDisplayName;
  const subjectId = body.subjectId ?? existing.subjectId;
  const academicYearId = body.academicYearId ?? existing.academicYearId;
  const semester = body.semester ?? existing.semester;

  if (roomId && caller) {
    await assertRoomAssignable(roomId, academicYearId, semester, caller);
  }
  if (facultyId) {
    const [subject, user, currentUnits] = await Promise.all([
      prisma.subject.findUnique({ where: { id: subjectId }, select: { units: true } }),
      prisma.user.findUnique({ where: { id: facultyId }, select: { maxUnits: true, name: true } }),
      getFacultyAssignedUnits(facultyId, existing.academicYearId, existing.semester, id),
    ]);
    if (subject && user?.maxUnits != null) {
      const newTotal = currentUnits + subject.units;
      if (newTotal > user.maxUnits) {
        throw badRequest(
          `Faculty ${user.name ?? "selected"} has reached maximum units (${user.maxUnits}). Current: ${currentUnits}, this subject: ${subject.units}.`
        );
      }
    }
  }

  const payload: PreviewFacultyLoadBody = {
    facultyId,
    facultyDisplayName,
    subjectId: body.subjectId ?? existing.subjectId,
    studentClassId: body.studentClassId ?? existing.studentClassId,
    roomId,
    roomDisplayName,
    dayOfWeek: body.dayOfWeek ?? existing.dayOfWeek,
    startTime: body.startTime ?? existing.startTime,
    endTime: body.endTime ?? existing.endTime,
    semester: body.semester ?? existing.semester,
    academicYearId: body.academicYearId ?? existing.academicYearId,
    excludeLoadId: id,
  };

  const conflicts = await checkConflicts(payload);
  assertNoConflicts(conflicts);

  const updateData = {
    facultyId: body.facultyId !== undefined ? (body.facultyId?.trim() || null) : undefined,
    facultyDisplayName: body.facultyDisplayName !== undefined ? (body.facultyDisplayName?.trim() || null) : undefined,
    subjectId: body.subjectId,
    studentClassId: body.studentClassId,
    roomId: body.roomId !== undefined ? (body.roomId?.trim() || null) : undefined,
    roomDisplayName: body.roomDisplayName !== undefined ? (body.roomDisplayName?.trim() || null) : undefined,
    dayOfWeek: body.dayOfWeek,
    startTime: body.startTime,
    endTime: body.endTime,
    semester: body.semester,
    academicYearId: body.academicYearId,
  };
  const data = Object.fromEntries(Object.entries(updateData).filter(([, v]) => v !== undefined));

  return prisma.$transaction(async (tx) => {
    const conflictsAgain = await checkConflicts(payload, tx);
    assertNoConflicts(conflictsAgain);
    return tx.facultyLoad.update({
      where: { id },
      data,
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

export async function deleteFacultyLoad(id: string, caller?: CallerContext) {
  const load = await prisma.facultyLoad.findUnique({
    where: { id },
    include: { studentClass: { include: { curriculum: { select: { departmentId: true } } } } },
  });
  if (!load) throw notFound("Faculty load not found");
  if (caller) await assertStudentClassInDepartment(load.studentClassId, caller);
  await prisma.facultyLoad.delete({ where: { id } });
}

export async function resetForClass(
  academicYearId: string,
  semester: number,
  studentClassId: string,
  caller?: CallerContext
) {
  if (caller) await assertStudentClassInDepartment(studentClassId, caller);
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

export async function copyClassSchedule(body: CopyFromPreviousFacultyLoadBody, caller?: CallerContext): Promise<CopyClassScheduleResult> {
  const { studentClassId, sourceAcademicYearId, sourceSemester, targetAcademicYearId, targetSemester } = body;

  if (caller) await assertStudentClassInDepartment(studentClassId, caller);

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
  // Note: source loads may have null facultyId/roomId (off-system); we copy display names when present.

  if (!sourceLoads.length) {
    throw badRequest("No existing schedule found for the selected source term");
  }

  const result = await prisma.$transaction(async (tx) => {
    const copied: CopiedFacultyLoadSummary[] = [];
    const skipped: SkippedFacultyLoadSummary[] = [];

    for (const load of sourceLoads) {
      const payload: PreviewFacultyLoadBody = {
        facultyId: load.facultyId ?? null,
        facultyDisplayName: load.facultyDisplayName ?? null,
        subjectId: load.subjectId,
        studentClassId: load.studentClassId,
        roomId: load.roomId ?? null,
        roomDisplayName: load.roomDisplayName ?? null,
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
        facultyName: load.faculty?.name ?? load.facultyDisplayName ?? null,
        roomName: load.room?.name ?? load.roomDisplayName ?? null,
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
          facultyDisplayName: load.facultyDisplayName,
          subjectId: load.subjectId,
          studentClassId: load.studentClassId,
          roomId: load.roomId,
          roomDisplayName: load.roomDisplayName,
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

export async function autoAssignForClass(
  academicYearId: string,
  semester: number,
  studentClassId: string,
  ruleSetIdOverride?: string,
  caller?: CallerContext
) {
  if (caller) await assertStudentClassInDepartment(studentClassId, caller);
  const studentClass = await prisma.studentClass.findUnique({
    where: { id: studentClassId },
    include: { curriculum: { select: { id: true, departmentId: true } } },
  });
  if (!studentClass) throw notFound("Student class not found");

  const curriculumId = studentClass.curriculumId;
  // Only auto-schedule subjects that belong to this curriculum, this class year level, and the selected semester.
  // Include subjects with semester null (offer in both semesters). Exclude subjects that belong to the other semester.
  const subjects = await prisma.subject.findMany({
    where: {
      curriculumId,
      yearLevel: studentClass.yearLevel,
      OR: [{ semester: null }, { semester }],
    },
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

  // Treat pending cross-department requests as placed: count their minutes and block those slots.
  const pendingRequests = await prisma.crossDepartmentLoadRequest.findMany({
    where: {
      studentClassId,
      academicYearId,
      semester,
      status: "PENDING",
    },
  });
  for (const req of pendingRequests) {
    const mins = timeToMinutes(req.endTime) - timeToMinutes(req.startTime);
    scheduledBySubject.set(req.subjectId, (scheduledBySubject.get(req.subjectId) ?? 0) + mins);
  }

  // Preload faculty (with maxUnits for cap check) and rooms.
  const faculties = await prisma.user.findMany({
    where: { role: "FACULTY" },
    select: { id: true, departmentId: true, maxUnits: true },
  });
  const subjectUnitsMap = new Map<string, number>(subjects.map((s) => [s.id, s.units]));
  const currentUnitsByFaculty = new Map<string, number>();
  for (const l of allLoads) {
    if (l.facultyId == null) continue;
    const u = subjectUnitsMap.get(l.subjectId) ?? 0;
    currentUnitsByFaculty.set(l.facultyId, (currentUnitsByFaculty.get(l.facultyId) ?? 0) + u);
  }
  for (const req of pendingRequests) {
    const u = subjectUnitsMap.get(req.subjectId) ?? 0;
    currentUnitsByFaculty.set(req.facultyId, (currentUnitsByFaculty.get(req.facultyId) ?? 0) + u);
  }
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
    if (l.facultyId != null) {
      addInterval(facultyBusy, l.facultyId, interval);
      facultyMinutes.set(l.facultyId, (facultyMinutes.get(l.facultyId) ?? 0) + mins);
    }
    if (l.roomId != null) {
      addInterval(roomBusy, l.roomId, interval);
      roomMinutes.set(l.roomId, (roomMinutes.get(l.roomId) ?? 0) + mins);
    }
    addInterval(classBusy, l.studentClassId, interval);
  }

  for (const req of pendingRequests) {
    const start = timeToMinutes(req.startTime);
    const end = timeToMinutes(req.endTime);
    const mins = end - start;
    const interval: Interval = { dayOfWeek: req.dayOfWeek, start, end };
    addInterval(facultyBusy, req.facultyId, interval);
    facultyMinutes.set(req.facultyId, (facultyMinutes.get(req.facultyId) ?? 0) + mins);
    if (req.roomId != null) {
      addInterval(roomBusy, req.roomId, interval);
      roomMinutes.set(req.roomId, (roomMinutes.get(req.roomId) ?? 0) + mins);
    }
    addInterval(classBusy, req.studentClassId, interval);
  }

  const newLoads: CreateFacultyLoadBody[] = [];
  /** Subjects that could not be fully scheduled, with reason (no faculty, no room, no slot). */
  const skippedSummary: { subjectCode: string; subjectName: string; reason: string }[] = [];

  const config: SchedulingRuleSetConfig = ruleSetIdOverride
    ? await getRuleSetConfigById(ruleSetIdOverride)
    : await getConfigForAutoAssign(academicYearId, studentClassId);
  const WORK_START = config.workStartMinutes;
  const WORK_END = config.workEndMinutes;
  const LUNCH_START = config.lunchStartMinutes;
  const LUNCH_END = config.lunchEndMinutes;
  const SLOT_STEP = config.slotStepMinutes;
  const avoidLunchSpan = config.avoidLunchSpan;
  const preferMwf3Unit = config.preferMwfFor3UnitLecture;
  const preferTth3Unit = config.preferTthFor3UnitLecture;
  const requireLabBreakAfterLongLab = config.requireLabBreakAfterLongLab;
  const preferRandom3Day3Unit = config.preferRandom3DayFor3UnitLecture;
  const maxBlockMinutes = config.maxBlockMinutes;
  const excludedDays = config.excludedDays ?? [];

  const days: number[] = [1, 2, 3, 4, 5, 6].filter((d) => !excludedDays.includes(d));
  const MWF = [1, 3, 5].filter((d) => !excludedDays.includes(d));
  const TTH = [2, 4].filter((d) => !excludedDays.includes(d));

  // Track long (>= 3hr) lab sessions per class for enforcing breaks between them.
  // Include existing and pending blocks so we don't place a long lab too close to an awaiting-approval one.
  const subjectIsLab = new Map<string, boolean>(subjects.map((s) => [s.id, s.isLab]));
  const classLongLabBusy = new Map<string, Interval[]>();
  for (const l of classLoads) {
    if (!subjectIsLab.get(l.subjectId)) continue;
    const start = timeToMinutes(l.startTime);
    const end = timeToMinutes(l.endTime);
    if (end - start < 180) continue;
    const arr = classLongLabBusy.get(l.studentClassId) ?? [];
    arr.push({ dayOfWeek: l.dayOfWeek, start, end });
    classLongLabBusy.set(l.studentClassId, arr);
  }
  for (const req of pendingRequests) {
    if (!subjectIsLab.get(req.subjectId)) continue;
    const start = timeToMinutes(req.startTime);
    const end = timeToMinutes(req.endTime);
    if (end - start < 180) continue;
    const arr = classLongLabBusy.get(req.studentClassId) ?? [];
    arr.push({ dayOfWeek: req.dayOfWeek, start, end });
    classLongLabBusy.set(req.studentClassId, arr);
  }

  function violatesLabBreak(
    dayOfWeek: number,
    startMinutes: number,
    blockMinutes: number,
    isLab: boolean
  ): boolean {
    if (!requireLabBreakAfterLongLab || !isLab || blockMinutes < 180) return false;
    const intervals = classLongLabBusy.get(studentClassId) ?? [];
    const end = startMinutes + blockMinutes;
    for (const i of intervals) {
      if (i.dayOfWeek !== dayOfWeek) continue;
      // Require at least 60 minutes gap between long labs on the same day.
      const gapBefore = startMinutes - i.end;
      const gapAfter = i.start - end;
      if (gapBefore >= 0 && gapBefore < 60) return true;
      if (gapAfter >= 0 && gapAfter < 60) return true;
    }
    return false;
  }

  function isFree(
    facultyId: string,
    roomId: string,
    dayOfWeek: number,
    startMinutes: number,
    blockMinutes: number
  ): boolean {
    const end = startMinutes + blockMinutes;
    if (avoidLunchSpan && startMinutes < LUNCH_END && end > LUNCH_START) return false;
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
    blockMinutes: number,
    isLab: boolean
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
    if (isLab && blockMinutes >= 180) {
      const existing = classLongLabBusy.get(studentClassId) ?? [];
      existing.push(interval);
      classLongLabBusy.set(studentClassId, existing);
    }
  }

  for (const s of subjects) {
    const required = requiredBySubject.get(s.id) ?? 0;
    const already = scheduledBySubject.get(s.id) ?? 0;
    let remaining = required - already;
    if (remaining <= 0) continue;

    // Choose a faculty: use prioritized faculty for this subject if any; else department + load balance.
    const subjectDeptId = s.departmentId ?? studentClass.curriculum.departmentId ?? null;
    const prioritized = prioritiesBySubject.get(s.id);
    let facultyPool: { id: string; departmentId: string | null; maxUnits: number | null }[];
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
    // Exclude faculty who would exceed max units for this term
    const facultyPoolWithinCap = facultyPool.filter((f) => {
      const maxUnits = f.maxUnits ?? Infinity;
      const current = currentUnitsByFaculty.get(f.id) ?? 0;
      return current + s.units <= maxUnits;
    });
    const poolToUse = facultyPoolWithinCap.length > 0 ? facultyPoolWithinCap : facultyPool;
    if (!poolToUse.length) {
      skippedSummary.push({ subjectCode: s.code, subjectName: s.name, reason: "No faculty available" });
      continue;
    }

    let chosenFacultyId: string;
    if (prioritized && prioritized.length > 0) {
      const byPriority = new Map(prioritized.map((p, i) => [p.facultyId, i]));
      const sorted = [...poolToUse].sort((a, b) => {
        const minsA = facultyMinutes.get(a.id) ?? 0;
        const minsB = facultyMinutes.get(b.id) ?? 0;
        if (minsA !== minsB) return minsA - minsB;
        return (byPriority.get(a.id) ?? 999) - (byPriority.get(b.id) ?? 999);
      });
      chosenFacultyId = sorted[0].id;
    } else {
      chosenFacultyId = poolToUse[0].id;
      let minFacultyMinutes = facultyMinutes.get(chosenFacultyId) ?? 0;
      for (const f of poolToUse) {
        const mins = facultyMinutes.get(f.id) ?? 0;
        if (mins < minFacultyMinutes) {
          minFacultyMinutes = mins;
          chosenFacultyId = f.id;
        }
      }
    }
    currentUnitsByFaculty.set(chosenFacultyId, (currentUnitsByFaculty.get(chosenFacultyId) ?? 0) + s.units);

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

    // 3-unit lecture: prefer MWF (3×1 hr), TTh (2×1.5 hr), or random 3×1 hr across days when rule set enables it; one block per meeting, not split.
    const shouldUsePattern =
      (preferMwf3Unit || preferTth3Unit || preferRandom3Day3Unit) && !s.isLab && s.units === 3 && remaining >= 180;
    if (shouldUsePattern) {
      let patternPlaced = false;
      if (preferMwf3Unit && MWF.length === 3) {
        for (let start = WORK_START; start + 60 <= WORK_END; start += SLOT_STEP) {
          const allFree = MWF.every(
            (d) =>
              isFree(chosenFacultyId, chosenRoomId, d, start, 60) &&
              !violatesLabBreak(d, start, 60, s.isLab)
          );
          if (allFree) {
            for (const d of MWF) {
              placeBlock(s.id, chosenFacultyId, chosenRoomId, d, start, 60, s.isLab);
            }
            remaining -= 180;
            patternPlaced = true;
            break;
          }
        }
      }
      if (!patternPlaced && preferTth3Unit && TTH.length === 2 && remaining >= 180) {
        for (let start = WORK_START; start + 90 <= WORK_END; start += SLOT_STEP) {
          const allFree = TTH.every(
            (d) =>
              isFree(chosenFacultyId, chosenRoomId, d, start, 90) &&
              !violatesLabBreak(d, start, 90, s.isLab)
          );
          if (allFree) {
            for (const d of TTH) {
              placeBlock(s.id, chosenFacultyId, chosenRoomId, d, start, 90, s.isLab);
            }
            remaining -= 180;
            patternPlaced = true;
            break;
          }
        }
      }
      if (!patternPlaced && preferRandom3Day3Unit && days.length >= 3 && remaining >= 180) {
        // Build all combinations of 3 distinct days from the available days and shuffle them
        const combos: number[][] = [];
        for (let i = 0; i < days.length; i++) {
          for (let j = i + 1; j < days.length; j++) {
            for (let k = j + 1; k < days.length; k++) {
              combos.push([days[i], days[j], days[k]]);
            }
          }
        }
        for (let i = combos.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [combos[i], combos[j]] = [combos[j], combos[i]];
        }
        outerRandom: for (const combo of combos) {
          for (let start = WORK_START; start + 60 <= WORK_END; start += SLOT_STEP) {
            const allFree = combo.every(
              (d) =>
                isFree(chosenFacultyId, chosenRoomId, d, start, 60) &&
                !violatesLabBreak(d, start, 60, s.isLab)
            );
            if (allFree) {
              for (const d of combo) {
                placeBlock(s.id, chosenFacultyId, chosenRoomId, d, start, 60, s.isLab);
              }
              remaining -= 180;
              patternPlaced = true;
              break outerRandom;
            }
          }
        }
      }
    }

    // Remaining minutes: place as single continuous blocks (one block per session, no splitting).
      while (remaining > 0) {
        const blockMinutes = Math.min(remaining, maxBlockMinutes);
        let placed = false;

        outer: for (const day of days) {
          for (let start = WORK_START; start + blockMinutes <= WORK_END; start += SLOT_STEP) {
            if (
              isFree(chosenFacultyId, chosenRoomId, day, start, blockMinutes) &&
              !violatesLabBreak(day, start, blockMinutes, s.isLab)
            ) {
              placeBlock(s.id, chosenFacultyId, chosenRoomId, day, start, blockMinutes, s.isLab);
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
    facultyName: load.faculty?.name ?? load.facultyDisplayName ?? "—",
    roomName: load.room?.name ?? load.roomDisplayName ?? "—",
    dayOfWeek: load.dayOfWeek,
    startTime: load.startTime,
    endTime: load.endTime,
  }));

  return { assigned, skipped: skippedSummary };
}