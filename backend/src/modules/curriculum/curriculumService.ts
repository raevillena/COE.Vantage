import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import type { CreateCurriculumBody, UpdateCurriculumBody } from "./curriculumSchemas.js";

export async function listCurricula() {
  return prisma.curriculum.findMany({
    include: { department: { select: { id: true, name: true, code: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getCurriculumById(id: string) {
  const c = await prisma.curriculum.findUnique({
    where: { id },
    include: { department: { select: { id: true, name: true, code: true } } },
  });
  if (!c) throw notFound("Curriculum not found");
  return c;
}

export async function createCurriculum(body: CreateCurriculumBody) {
  if (body.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!dept) throw badRequest("Department not found");
  }
  return prisma.curriculum.create({
    data: { name: body.name, code: body.code, departmentId: body.departmentId ?? undefined },
    include: { department: { select: { id: true, name: true, code: true } } },
  });
}

export async function updateCurriculum(id: string, body: UpdateCurriculumBody) {
  const c = await prisma.curriculum.findUnique({ where: { id } });
  if (!c) throw notFound("Curriculum not found");
  if (body.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!dept) throw badRequest("Department not found");
  }
  return prisma.curriculum.update({
    where: { id },
    data: { name: body.name, code: body.code, departmentId: body.departmentId ?? undefined },
    include: { department: { select: { id: true, name: true, code: true } } },
  });
}

export async function deleteCurriculum(id: string) {
  const c = await prisma.curriculum.findUnique({ where: { id } });
  if (!c) throw notFound("Curriculum not found");
  await prisma.curriculum.delete({ where: { id } });
}