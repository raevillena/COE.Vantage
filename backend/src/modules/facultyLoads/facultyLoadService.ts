import { prisma } from "../../prisma/client.js";
import { notFound } from "../../utils/errors.js";
import { checkConflicts, assertNoConflicts } from "./conflictService.js";
import type { CreateFacultyLoadBody, UpdateFacultyLoadBody, PreviewFacultyLoadBody } from "./facultyLoadSchemas.js";

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