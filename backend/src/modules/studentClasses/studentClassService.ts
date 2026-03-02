import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import type { CreateStudentClassBody, UpdateStudentClassBody } from "./studentClassSchemas.js";

export async function listStudentClasses() {
  return prisma.studentClass.findMany({
    where: { isDeleted: false },
    include: { curriculum: { select: { id: true, name: true, code: true } } },
    orderBy: [{ yearLevel: "asc" }, { name: "asc" }],
  });
}

export async function getStudentClassById(id: string) {
  const c = await prisma.studentClass.findUnique({
    where: { id },
    include: { curriculum: { select: { id: true, name: true, code: true } } },
  });
  if (!c || c.isDeleted) throw notFound("Student class not found");
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
  if (c.isDeleted) throw badRequest("Cannot update a deleted student class. Restore it from Trash first.");
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

export async function softDeleteStudentClass(id: string) {
  const c = await prisma.studentClass.findUnique({ where: { id } });
  if (!c) throw notFound("Student class not found");
  if (c.isDeleted) throw badRequest("Student class is already deleted");
  await prisma.studentClass.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

export async function listTrashStudentClasses() {
  return prisma.studentClass.findMany({
    where: { isDeleted: true },
    include: { curriculum: { select: { id: true, name: true, code: true } } },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreStudentClass(id: string) {
  const c = await prisma.studentClass.findUnique({ where: { id } });
  if (!c) throw notFound("Student class not found");
  if (!c.isDeleted) throw badRequest("Student class is not in trash");
  await prisma.studentClass.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });
}

export async function permanentDeleteStudentClass(id: string) {
  const c = await prisma.studentClass.findUnique({ where: { id } });
  if (!c) throw notFound("Student class not found");
  if (!c.isDeleted) throw badRequest("Only student classes in Trash can be permanently deleted");
  await prisma.studentClass.delete({ where: { id } });
}