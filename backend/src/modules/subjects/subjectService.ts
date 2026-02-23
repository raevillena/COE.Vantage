import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import type { CreateSubjectBody, UpdateSubjectBody } from "./subjectSchemas.js";

export async function listSubjects() {
  return prisma.subject.findMany({
    include: {
      curriculum: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
    orderBy: { code: "asc" },
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
  if (!s) throw notFound("Subject not found");
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
      curriculumId: body.curriculumId ?? undefined,
      departmentId: body.departmentId ?? undefined,
    },
    include: {
      curriculum: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function deleteSubject(id: string) {
  const s = await prisma.subject.findUnique({ where: { id } });
  if (!s) throw notFound("Subject not found");
  await prisma.subject.delete({ where: { id } });
}