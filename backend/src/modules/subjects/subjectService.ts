import { prisma } from "../../prisma/client.js";
import { badRequest, notFound, forbidden, conflict } from "../../utils/errors.js";
import { TEACHING_ROLES } from "../../utils/teachingRoles.js";
import { resolveSubjectUnits } from "../../utils/workload.js";
import type { CreateSubjectBody, UpdateSubjectBody } from "./subjectSchemas.js";

/** Caller context: CHAIRMAN sees only subjects in their department's curricula (or unassigned with their department). */
export interface SubjectListCaller {
  role: string;
  departmentId: string | null;
}

export async function listSubjects(caller?: SubjectListCaller) {
  const where: { isDeleted: boolean; OR?: Array<Record<string, unknown>> } = { isDeleted: false };
  if (caller?.role === "CHAIRMAN" && caller.departmentId) {
    where.OR = [
      { curriculum: { departmentId: caller.departmentId } },
      { curriculumId: null, departmentId: caller.departmentId },
    ];
  }
  return prisma.subject.findMany({
    where,
    include: {
      curriculum: {
        select: {
          id: true,
          name: true,
          code: true,
          department: { select: { id: true, name: true, code: true } },
        },
      },
      department: { select: { id: true, name: true, code: true } },
      subjectRooms: { select: { roomId: true, room: { select: { name: true } } } },
    },
    orderBy: { code: "asc" },
  });
}

/** List subjects for a curriculum (for curriculum viewer). */
export async function listSubjectsByCurriculumId(curriculumId: string) {
  return prisma.subject.findMany({
    where: { curriculumId, isDeleted: false },
    orderBy: [{ yearLevel: "asc" }, { semester: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, units: true, isLab: true, lecUnits: true, labUnits: true, yearLevel: true, semester: true },
  });
}

export async function getSubjectById(id: string) {
  const s = await prisma.subject.findUnique({
    where: { id },
    include: {
      curriculum: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });
  if (!s || s.isDeleted) throw notFound("Subject not found");
  return s;
}

export async function createSubject(body: CreateSubjectBody) {
  if (body.curriculumId) {
    const c = await prisma.curriculum.findUnique({ where: { id: body.curriculumId } });
    if (!c) throw badRequest("Curriculum not found");
    const existing = await prisma.subject.findFirst({
      where: { curriculumId: body.curriculumId, code: body.code },
    });
    if (existing) throw conflict("A subject with this code already exists in this curriculum.");
  }
  if (body.departmentId) {
    const d = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!d) throw badRequest("Department not found");
  }
  const unitFields = resolveSubjectUnits(body);
  if (!unitFields) throw badRequest("Lecture and/or laboratory units are required");
  return prisma.subject.create({
    data: {
      code: body.code,
      name: body.name,
      ...unitFields,
      yearLevel: body.yearLevel ?? undefined,
      semester: body.semester ?? undefined,
      curriculumId: body.curriculumId ?? undefined,
      departmentId: body.departmentId ?? undefined,
    },
    include: {
      curriculum: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function updateSubject(id: string, body: UpdateSubjectBody) {
  const s = await prisma.subject.findUnique({ where: { id } });
  if (!s) throw notFound("Subject not found");
  if (s.isDeleted) throw badRequest("Cannot update a deleted subject. Restore it from Trash first.");
  if (body.curriculumId) {
    const c = await prisma.curriculum.findUnique({ where: { id: body.curriculumId } });
    if (!c) throw badRequest("Curriculum not found");
  }
  if (body.departmentId) {
    const d = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!d) throw badRequest("Department not found");
  }
  const effectiveCurriculumId = body.curriculumId !== undefined ? body.curriculumId : s.curriculumId;
  const effectiveCode = body.code !== undefined ? body.code : s.code;
  if (effectiveCurriculumId != null) {
    const existing = await prisma.subject.findFirst({
      where: {
        curriculumId: effectiveCurriculumId,
        code: effectiveCode,
        id: { not: id },
      },
    });
    if (existing) throw conflict("A subject with this code already exists in this curriculum.");
  }
  const unitFields = resolveSubjectUnits(body, s);
  return prisma.subject.update({
    where: { id },
    data: {
      code: body.code,
      name: body.name,
      ...unitFields,
      // For updates we respect explicit null (to clear) and undefined (no change),
      // so do not coerce with ?? here.
      yearLevel: body.yearLevel,
      semester: body.semester,
      curriculumId: body.curriculumId,
      departmentId: body.departmentId,
    },
    include: {
      curriculum: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function softDeleteSubject(id: string) {
  const s = await prisma.subject.findUnique({ where: { id } });
  if (!s) throw notFound("Subject not found");
  if (s.isDeleted) throw badRequest("Subject is already deleted");
  await prisma.subject.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

export async function listTrashSubjects() {
  return prisma.subject.findMany({
    where: { isDeleted: true },
    include: {
      curriculum: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreSubject(id: string) {
  const s = await prisma.subject.findUnique({ where: { id } });
  if (!s) throw notFound("Subject not found");
  if (!s.isDeleted) throw badRequest("Subject is not in trash");
  await prisma.subject.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });
}

export async function permanentDeleteSubject(id: string) {
  const s = await prisma.subject.findUnique({ where: { id } });
  if (!s) throw notFound("Subject not found");
  if (!s.isDeleted) throw badRequest("Only subjects in Trash can be permanently deleted");
  await prisma.subject.delete({ where: { id } });
}

/** Caller for chairman scope: only allow for subjects in their department's curricula. */
export interface SubjectCaller {
  role: string;
  departmentId: string | null;
}

export interface PriorityTerm {
  academicYearId: string;
  semester: number;
}

export async function getPrioritizedFaculty(subjectId: string, term: PriorityTerm) {
  const s = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!s || s.isDeleted) throw notFound("Subject not found");
  const list = await prisma.subjectFacultyPriority.findMany({
    where: { subjectId, academicYearId: term.academicYearId, semester: term.semester },
    orderBy: { priority: "asc" },
    include: { faculty: { select: { id: true, name: true, email: true } } },
  });
  return list.map((p) => ({
    facultyId: p.facultyId,
    priority: p.priority,
    name: p.faculty.name,
    email: p.faculty.email,
  }));
}

/** Replaces the faculty list of one subject for one term only; other terms are left alone. */
export async function setPrioritizedFaculty(
  subjectId: string,
  facultyIds: string[],
  term: PriorityTerm,
  caller?: SubjectCaller
) {
  const s = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: { curriculum: { select: { departmentId: true } } },
  });
  if (!s || s.isDeleted) throw notFound("Subject not found");
  const ay = await prisma.academicYear.findFirst({ where: { id: term.academicYearId, isDeleted: false } });
  if (!ay) throw badRequest("Academic year not found");
  if (caller?.role === "CHAIRMAN" && caller.departmentId) {
    const subjectDeptId = s.curriculum?.departmentId ?? s.departmentId ?? null;
    if (subjectDeptId !== caller.departmentId) {
      throw forbidden("You can only set prioritized faculty for subjects in your department.");
    }
  }
  const faculty = await prisma.user.findMany({
    where: { id: { in: facultyIds }, role: { in: TEACHING_ROLES }, isDeleted: false },
    select: { id: true },
  });
  const validIds = new Set(faculty.map((f) => f.id));
  const invalid = facultyIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) throw badRequest("Some faculty IDs are invalid or not faculty: " + invalid.join(", "));

  const termWhere = { subjectId, academicYearId: term.academicYearId, semester: term.semester };
  await prisma.$transaction(async (tx) => {
    await tx.subjectFacultyPriority.deleteMany({ where: termWhere });
    if (facultyIds.length > 0) {
      await tx.subjectFacultyPriority.createMany({
        data: facultyIds.map((facultyId, index) => ({
          subjectId,
          facultyId,
          priority: index,
          academicYearId: term.academicYearId,
          semester: term.semester,
        })),
      });
    }
  });

  return getPrioritizedFaculty(subjectId, term);
}

/**
 * Copies possible subjects from one term to another so a new semester starts from the last one without
 * touching it. Rows already in the target term are kept. A chairman copies only their own department's faculty.
 */
export async function copyPrioritizedFaculty(
  body: {
    fromAcademicYearId: string;
    fromSemester: number;
    toAcademicYearId: string;
    toSemester: number;
    facultyIds?: string[];
  },
  caller?: SubjectCaller
) {
  if (body.fromAcademicYearId === body.toAcademicYearId && body.fromSemester === body.toSemester) {
    throw badRequest("Pick a different term to copy from.");
  }
  const ay = await prisma.academicYear.findFirst({ where: { id: body.toAcademicYearId, isDeleted: false } });
  if (!ay) throw badRequest("Target academic year not found");

  const facultyWhere: Record<string, unknown> = {};
  if (caller?.role === "CHAIRMAN") {
    if (!caller.departmentId) throw forbidden("Chairman must belong to a department.");
    facultyWhere.faculty = { departmentId: caller.departmentId };
  }
  if (body.facultyIds && body.facultyIds.length > 0) facultyWhere.facultyId = { in: body.facultyIds };

  const source = await prisma.subjectFacultyPriority.findMany({
    where: {
      academicYearId: body.fromAcademicYearId,
      semester: body.fromSemester,
      subject: { isDeleted: false },
      ...facultyWhere,
    },
    orderBy: [{ subjectId: "asc" }, { priority: "asc" }],
    select: { subjectId: true, facultyId: true, priority: true },
  });
  const result = await prisma.subjectFacultyPriority.createMany({
    data: source.map((r) => ({
      subjectId: r.subjectId,
      facultyId: r.facultyId,
      priority: r.priority,
      academicYearId: body.toAcademicYearId,
      semester: body.toSemester,
    })),
    skipDuplicates: true,
  });
  return { found: source.length, copied: result.count, skipped: source.length - result.count };
}

/** Rooms this subject is restricted to for auto-assign (empty = any available room). */
export async function getSubjectRooms(subjectId: string) {
  const s = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!s || s.isDeleted) throw notFound("Subject not found");
  const rows = await prisma.subjectRoom.findMany({
    where: { subjectId, room: { isDeleted: false } },
    include: { room: { select: { id: true, name: true, capacity: true, isLab: true, departmentId: true } } },
    orderBy: { room: { name: "asc" } },
  });
  return rows.map((r) => r.room);
}

/** Replaces the room list of a subject. A chairman can only do this for subjects of their department. */
export async function setSubjectRooms(subjectId: string, roomIds: string[], caller?: SubjectCaller) {
  const s = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: { curriculum: { select: { departmentId: true } } },
  });
  if (!s || s.isDeleted) throw notFound("Subject not found");
  if (caller?.role === "CHAIRMAN" && caller.departmentId) {
    const subjectDeptId = s.curriculum?.departmentId ?? s.departmentId ?? null;
    if (subjectDeptId !== caller.departmentId) {
      throw forbidden("You can only set rooms for subjects in your department.");
    }
  }
  const unique = [...new Set(roomIds)];
  const rooms = await prisma.room.findMany({ where: { id: { in: unique }, isDeleted: false }, select: { id: true } });
  if (rooms.length !== unique.length) throw badRequest("Some rooms were not found.");
  await prisma.$transaction(async (tx) => {
    await tx.subjectRoom.deleteMany({ where: { subjectId } });
    if (unique.length > 0) {
      await tx.subjectRoom.createMany({ data: unique.map((roomId) => ({ subjectId, roomId })) });
    }
  });
  return getSubjectRooms(subjectId);
}
