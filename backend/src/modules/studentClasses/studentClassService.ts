import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import type { CreateStudentClassBody, UpdateStudentClassBody } from "./studentClassSchemas.js";

export async function listStudentClasses() {
  return prisma.studentClass.findMany({
    include: { curriculum: { select: { id: true, name: true, code: true } } },
    orderBy: [{ yearLevel: "asc" }, { name: "asc" }],
  });
}

export async function getStudentClassById(id: string) {
  const c = await prisma.studentClass.findUnique({
    where: { id },
    include: { curriculum: { select: { id: true, name: true, code: true } } },
  });
  if (!c) throw notFound("Student class not found");
  return c;
}

export async function createStudentClass(body: CreateStudentClassBody) {
  const curr = await prisma.curriculum.findUnique({ where: { id: body.curriculumId } });
  if (!curr) throw badRequest("Curriculum not found");
  return prisma.studentClass.create({
    data: body,
    include: { curriculum: { select: { id: true, name: true, code: true } } },
  });
}

export async function updateStudentClass(id: string, body: UpdateStudentClassBody) {
  const c = await prisma.studentClass.findUnique({ where: { id } });
  if (!c) throw notFound("Student class not found");
  if (body.curriculumId) {
    const curr = await prisma.curriculum.findUnique({ where: { id: body.curriculumId } });
    if (!curr) throw badRequest("Curriculum not found");
  }
  return prisma.studentClass.update({
    where: { id },
    data: body,
    include: { curriculum: { select: { id: true, name: true, code: true } } },
  });
}

export async function deleteStudentClass(id: string) {
  const c = await prisma.studentClass.findUnique({ where: { id } });
  if (!c) throw notFound("Student class not found");
  await prisma.studentClass.delete({ where: { id } });
}