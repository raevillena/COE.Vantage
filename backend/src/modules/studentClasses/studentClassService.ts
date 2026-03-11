import { prisma } from "../../prisma/client.js";
import { badRequest, notFound, forbidden } from "../../utils/errors.js";
import type { CreateStudentClassBody, UpdateStudentClassBody } from "./studentClassSchemas.js";

/** Caller context: CHAIRMAN sees only student classes in their department's curricula. */
export interface StudentClassCaller {
  role: string;
  departmentId: string | null;
}

const curriculumInclude = {
  select: {
    id: true,
    name: true,
    code: true,
    department: { select: { id: true, name: true, code: true } },
  },
} as const;

export async function listStudentClasses(caller?: StudentClassCaller) {
  const where: { isDeleted: boolean; curriculum?: { departmentId: string } } = { isDeleted: false };
  if (caller?.role === "CHAIRMAN" && caller.departmentId) {
    where.curriculum = { departmentId: caller.departmentId };
  }
  return prisma.studentClass.findMany({
    where,
    include: { curriculum: curriculumInclude },
    orderBy: [{ yearLevel: "asc" }, { name: "asc" }],
  });
}

export async function getStudentClassById(id: string, caller?: StudentClassCaller) {
  const c = await prisma.studentClass.findUnique({
    where: { id },
    include: { curriculum: { select: { id: true, name: true, code: true, departmentId: true, department: { select: { id: true, name: true, code: true } } } } },
  });
  if (!c || c.isDeleted) throw notFound("Student class not found");
  if (caller?.role === "CHAIRMAN" && caller.departmentId != null && c.curriculum.departmentId !== caller.departmentId) {
    throw forbidden("You can only access student classes in your department's curricula.");
  }
  const { departmentId: _d, ...curriculumSafe } = c.curriculum;
  return { ...c, curriculum: curriculumSafe };
}

export async function createStudentClass(body: CreateStudentClassBody, caller?: StudentClassCaller) {
  const curr = await prisma.curriculum.findUnique({ where: { id: body.curriculumId } });
  if (!curr) throw badRequest("Curriculum not found");
  if (caller?.role === "CHAIRMAN" && caller.departmentId != null && curr.departmentId !== caller.departmentId) {
    throw forbidden("You can only create student classes for curricula in your department.");
  }
  return prisma.studentClass.create({
    data: body,
    include: { curriculum: curriculumInclude },
  });
}

export async function updateStudentClass(id: string, body: UpdateStudentClassBody, caller?: StudentClassCaller) {
  const c = await prisma.studentClass.findUnique({
    where: { id },
    include: { curriculum: { select: { departmentId: true } } },
  });
  if (!c) throw notFound("Student class not found");
  if (c.isDeleted) throw badRequest("Cannot update a deleted student class. Restore it from Trash first.");
  if (caller?.role === "CHAIRMAN" && caller.departmentId != null && c.curriculum.departmentId !== caller.departmentId) {
    throw forbidden("You can only update student classes in your department's curricula.");
  }
  if (body.curriculumId) {
    const curr = await prisma.curriculum.findUnique({ where: { id: body.curriculumId } });
    if (!curr) throw badRequest("Curriculum not found");
    if (caller?.role === "CHAIRMAN" && caller.departmentId != null && curr.departmentId !== caller.departmentId) {
      throw forbidden("You can only assign a student class to curricula in your department.");
    }
  }
  return prisma.studentClass.update({
    where: { id },
    data: body,
    include: { curriculum: curriculumInclude },
  });
}

export async function softDeleteStudentClass(id: string, caller?: StudentClassCaller) {
  const c = await prisma.studentClass.findUnique({
    where: { id },
    include: { curriculum: { select: { departmentId: true } } },
  });
  if (!c) throw notFound("Student class not found");
  if (c.isDeleted) throw badRequest("Student class is already deleted");
  if (caller?.role === "CHAIRMAN" && caller.departmentId != null && c.curriculum.departmentId !== caller.departmentId) {
    throw forbidden("You can only delete student classes in your department's curricula.");
  }
  await prisma.studentClass.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

export async function listTrashStudentClasses(caller?: StudentClassCaller) {
  const where: { isDeleted: boolean; curriculum?: { departmentId: string } } = { isDeleted: true };
  if (caller?.role === "CHAIRMAN" && caller.departmentId) {
    where.curriculum = { departmentId: caller.departmentId };
  }
  return prisma.studentClass.findMany({
    where,
    include: { curriculum: curriculumInclude },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreStudentClass(id: string, caller?: StudentClassCaller) {
  const c = await prisma.studentClass.findUnique({
    where: { id },
    include: { curriculum: { select: { departmentId: true } } },
  });
  if (!c) throw notFound("Student class not found");
  if (!c.isDeleted) throw badRequest("Student class is not in trash");
  if (caller?.role === "CHAIRMAN" && caller.departmentId != null && c.curriculum.departmentId !== caller.departmentId) {
    throw forbidden("You can only restore student classes in your department's curricula.");
  }
  await prisma.studentClass.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });
}

export async function permanentDeleteStudentClass(id: string, caller?: StudentClassCaller) {
  const c = await prisma.studentClass.findUnique({
    where: { id },
    include: { curriculum: { select: { departmentId: true } } },
  });
  if (!c) throw notFound("Student class not found");
  if (!c.isDeleted) throw badRequest("Only student classes in Trash can be permanently deleted");
  if (caller?.role === "CHAIRMAN" && caller.departmentId != null && c.curriculum.departmentId !== caller.departmentId) {
    throw forbidden("You can only permanently delete student classes in your department's curricula.");
  }
  await prisma.studentClass.delete({ where: { id } });
}