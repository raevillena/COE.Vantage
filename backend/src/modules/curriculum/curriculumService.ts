import { prisma } from "../../prisma/client.js";
import { badRequest, conflict, notFound, forbidden } from "../../utils/errors.js";
import { codeFromName } from "../../utils/codeFromName.js";
import type { CreateCurriculumBody, UpdateCurriculumBody } from "./curriculumSchemas.js";

/** Caller context for scope: chairman sees only their department's curricula. */
export interface CurriculumCaller {
  role: string;
  departmentId: string | null;
}

export async function listCurricula(caller?: CurriculumCaller) {
  const where: { isDeleted: boolean; departmentId?: string } = { isDeleted: false };
  if (caller?.role === "CHAIRMAN" && caller.departmentId) {
    where.departmentId = caller.departmentId;
  }
  return prisma.curriculum.findMany({
    where,
    include: { department: { select: { id: true, name: true, code: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getCurriculumById(id: string) {
  const c = await prisma.curriculum.findUnique({
    where: { id },
    include: { department: { select: { id: true, name: true, code: true } } },
  });
  if (!c || c.isDeleted) throw notFound("Curriculum not found");
  return c;
}

export async function createCurriculum(body: CreateCurriculumBody, caller?: CurriculumCaller) {
  let departmentId = body.departmentId ?? undefined;
  if (caller?.role === "CHAIRMAN") {
    if (!caller.departmentId) throw badRequest("Chairman must belong to a department to create a curriculum.");
    departmentId = caller.departmentId;
  }
  if (departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw badRequest("Department not found");
  }
  return prisma.curriculum.create({
    data: {
      name: body.name,
      code: codeFromName(body.name),
      departmentId,
    },
    include: { department: { select: { id: true, name: true, code: true } } },
  });
}

export async function updateCurriculum(id: string, body: UpdateCurriculumBody, caller?: CurriculumCaller) {
  const c = await prisma.curriculum.findUnique({ where: { id } });
  if (!c) throw notFound("Curriculum not found");
  if (c.isDeleted) throw badRequest("Cannot update a deleted curriculum. Restore it from Trash first.");
  if (caller?.role === "CHAIRMAN" && c.departmentId !== caller.departmentId) {
    throw forbidden("You can only edit curricula for your own department.");
  }
  let departmentId = body.departmentId ?? undefined;
  if (caller?.role === "CHAIRMAN") departmentId = caller.departmentId ?? undefined;
  if (departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw badRequest("Department not found");
  }
  const name = body.name ?? c.name;
  return prisma.curriculum.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      code: codeFromName(name),
      departmentId,
    },
    include: { department: { select: { id: true, name: true, code: true } } },
  });
}

export async function softDeleteCurriculum(id: string, caller?: CurriculumCaller) {
  const c = await prisma.curriculum.findUnique({ where: { id } });
  if (!c) throw notFound("Curriculum not found");
  if (c.isDeleted) throw badRequest("Curriculum is already deleted");
  if (caller?.role === "CHAIRMAN" && c.departmentId !== caller.departmentId) {
    throw forbidden("You can only delete curricula for your own department.");
  }
  // The subjects of the curriculum go to Trash with it, stamped with the same time so that restoring the curriculum brings back
  // exactly those (and not subjects that were deleted earlier on their own).
  const now = new Date();
  await prisma.$transaction([
    prisma.curriculum.update({ where: { id }, data: { isDeleted: true, deletedAt: now } }),
    prisma.subject.updateMany({ where: { curriculumId: id, isDeleted: false }, data: { isDeleted: true, deletedAt: now } }),
  ]);
}

export async function listTrashCurricula() {
  return prisma.curriculum.findMany({
    where: { isDeleted: true },
    include: { department: { select: { id: true, name: true, code: true } } },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreCurriculum(id: string) {
  const c = await prisma.curriculum.findUnique({ where: { id } });
  if (!c) throw notFound("Curriculum not found");
  if (!c.isDeleted) throw badRequest("Curriculum is not in trash");
  await prisma.$transaction([
    prisma.curriculum.update({ where: { id }, data: { isDeleted: false, deletedAt: null } }),
    // only the subjects that went to Trash together with it
    ...(c.deletedAt ? [prisma.subject.updateMany({ where: { curriculumId: id, isDeleted: true, deletedAt: c.deletedAt }, data: { isDeleted: false, deletedAt: null } })] : []),
  ]);
}

export async function permanentDeleteCurriculum(id: string) {
  const c = await prisma.curriculum.findUnique({ where: { id } });
  if (!c) throw notFound("Curriculum not found");
  if (!c.isDeleted) throw badRequest("Only curricula in Trash can be permanently deleted");
  await prisma.curriculum.delete({ where: { id } });
}

/** Unassign all subjects from this curriculum (set curriculumId and yearLevel to null). Subjects remain in the system. */
export async function clearCurriculum(id: string, caller?: CurriculumCaller) {
  const c = await prisma.curriculum.findUnique({ where: { id } });
  if (!c) throw notFound("Curriculum not found");
  if (c.isDeleted) throw badRequest("Cannot clear a deleted curriculum.");
  if (caller?.role === "CHAIRMAN" && c.departmentId !== caller.departmentId) {
    throw forbidden("You can only clear curricula for your own department.");
  }
  await prisma.subjectSpecialization.deleteMany({ where: { subject: { curriculumId: id } } });
  await prisma.subject.updateMany({
    where: { curriculumId: id, isDeleted: false },
    data: { curriculumId: null, yearLevel: null },
  });
}

// ---- specializations ------------------------------------------------------------------------------------------

function assertOwnDepartment(c: { departmentId: string | null }, caller?: CurriculumCaller) {
  if (caller?.role === "CHAIRMAN" && c.departmentId !== caller.departmentId) {
    throw forbidden("You can only change curricula for your own department.");
  }
}

async function loadCurriculum(id: string, caller?: CurriculumCaller, forEdit = false) {
  const c = await prisma.curriculum.findUnique({ where: { id } });
  if (!c || c.isDeleted) throw notFound("Curriculum not found");
  if (forEdit || caller?.role === "CHAIRMAN") assertOwnDepartment(c, caller);
  return c;
}

/** The specializations of a curriculum, each with how many subjects are tagged with it and how many classes follow it. */
export async function listSpecializations(curriculumId: string, caller?: CurriculumCaller) {
  await loadCurriculum(curriculumId, caller);
  const rows = await prisma.curriculumSpecialization.findMany({
    where: { curriculumId },
    orderBy: { name: "asc" },
    include: { _count: { select: { subjects: true, studentClasses: true } } },
  });
  return rows.map(({ _count, ...r }) => ({ ...r, subjectCount: _count.subjects, classCount: _count.studentClasses }));
}

export async function createSpecialization(curriculumId: string, body: { name: string }, caller?: CurriculumCaller) {
  await loadCurriculum(curriculumId, caller, true);
  const name = body.name.trim();
  if (!name) throw badRequest("Name the specialization");
  const dup = await prisma.curriculumSpecialization.findFirst({ where: { curriculumId, name: { equals: name, mode: "insensitive" } } });
  if (dup) throw conflict("This curriculum already has a specialization with that name.");
  return prisma.curriculumSpecialization.create({ data: { curriculumId, name } });
}

export async function updateSpecialization(id: string, body: { name: string }, caller?: CurriculumCaller) {
  const spec = await prisma.curriculumSpecialization.findUnique({ where: { id } });
  if (!spec) throw notFound("Specialization not found");
  await loadCurriculum(spec.curriculumId, caller, true);
  const name = body.name.trim();
  if (!name) throw badRequest("Name the specialization");
  const dup = await prisma.curriculumSpecialization.findFirst({ where: { curriculumId: spec.curriculumId, id: { not: id }, name: { equals: name, mode: "insensitive" } } });
  if (dup) throw conflict("This curriculum already has a specialization with that name.");
  return prisma.curriculumSpecialization.update({ where: { id }, data: { name } });
}

/** Deleting one frees its subjects (a subject left with no specialization becomes common) and its classes (no specialization). */
export async function deleteSpecialization(id: string, caller?: CurriculumCaller) {
  const spec = await prisma.curriculumSpecialization.findUnique({ where: { id } });
  if (!spec) throw notFound("Specialization not found");
  await loadCurriculum(spec.curriculumId, caller, true);
  await prisma.curriculumSpecialization.delete({ where: { id } });
  return spec;
}

/** Sets which specializations a subject belongs to; none = common to all. Only specializations of the subject's own curriculum. */
export async function setSubjectSpecializations(curriculumId: string, subjectId: string, specializationIds: string[], caller?: CurriculumCaller) {
  await loadCurriculum(curriculumId, caller, true);
  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject || subject.isDeleted || subject.curriculumId !== curriculumId) throw notFound("Subject not found in this curriculum");
  const unique = Array.from(new Set(specializationIds));
  if (unique.length > 0) {
    const found = await prisma.curriculumSpecialization.count({ where: { id: { in: unique }, curriculumId } });
    if (found !== unique.length) throw badRequest("A specialization does not belong to this curriculum");
  }
  await prisma.$transaction([
    prisma.subjectSpecialization.deleteMany({ where: { subjectId } }),
    ...(unique.length > 0 ? [prisma.subjectSpecialization.createMany({ data: unique.map((specializationId) => ({ subjectId, specializationId })) })] : []),
  ]);
  return { subjectId, specializationIds: unique };
}
