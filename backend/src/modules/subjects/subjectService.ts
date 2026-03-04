import { prisma } from "../../prisma/client.js";
import { badRequest, notFound, forbidden } from "../../utils/errors.js";
import type { CreateSubjectBody, UpdateSubjectBody } from "./subjectSchemas.js";

export async function listSubjects() {
  return prisma.subject.findMany({
    where: { isDeleted: false },
    include: {
      curriculum: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
    orderBy: { code: "asc" },
  });
}

/** List subjects for a curriculum (for curriculum viewer). */
export async function listSubjectsByCurriculumId(curriculumId: string) {
  return prisma.subject.findMany({
    where: { curriculumId, isDeleted: false },
    orderBy: [{ yearLevel: "asc" }, { semester: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, units: true, isLab: true, yearLevel: true, semester: true },
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
  }
  if (body.departmentId) {
    const d = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!d) throw badRequest("Department not found");
  }
  return prisma.subject.create({
    data: {
      code: body.code,
      name: body.name,
      units: body.units,
      isLab: body.isLab,
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
  return prisma.subject.update({
    where: { id },
    data: {
      code: body.code,
      name: body.name,
      units: body.units,
      isLab: body.isLab,
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

export async function getPrioritizedFaculty(subjectId: string) {
  const s = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!s || s.isDeleted) throw notFound("Subject not found");
  const list = await prisma.subjectFacultyPriority.findMany({
    where: { subjectId },
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

export async function setPrioritizedFaculty(
  subjectId: string,
  facultyIds: string[],
  caller?: SubjectCaller
) {
  const s = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: { curriculum: { select: { departmentId: true } } },
  });
  if (!s || s.isDeleted) throw notFound("Subject not found");
  if (caller?.role === "CHAIRMAN" && caller.departmentId) {
    const subjectDeptId = s.curriculum?.departmentId ?? s.departmentId ?? null;
    if (subjectDeptId !== caller.departmentId) {
      throw forbidden("You can only set prioritized faculty for subjects in your department.");
    }
  }
  const faculty = await prisma.user.findMany({
    where: { id: { in: facultyIds }, role: "FACULTY", isDeleted: false },
    select: { id: true },
  });
  const validIds = new Set(faculty.map((f) => f.id));
  const invalid = facultyIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) throw badRequest("Some faculty IDs are invalid or not faculty: " + invalid.join(", "));

  await prisma.$transaction(async (tx) => {
    await tx.subjectFacultyPriority.deleteMany({ where: { subjectId } });
    if (facultyIds.length > 0) {
      await tx.subjectFacultyPriority.createMany({
        data: facultyIds.map((facultyId, index) => ({
          subjectId,
          facultyId,
          priority: index,
        })),
      });
    }
  });

  return getPrioritizedFaculty(subjectId);
}