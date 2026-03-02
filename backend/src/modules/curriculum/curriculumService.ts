import { prisma } from "../../prisma/client.js";
import { badRequest, notFound, forbidden } from "../../utils/errors.js";
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
  await prisma.curriculum.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
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
  await prisma.curriculum.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });
}

export async function permanentDeleteCurriculum(id: string) {
  const c = await prisma.curriculum.findUnique({ where: { id } });
  if (!c) throw notFound("Curriculum not found");
  if (!c.isDeleted) throw badRequest("Only curricula in Trash can be permanently deleted");
  await prisma.curriculum.delete({ where: { id } });
}