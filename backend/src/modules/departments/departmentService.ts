import { prisma } from "../../prisma/client.js";
import { badRequest, notFound, conflict } from "../../utils/errors.js";
import { codeFromName, explicitCodeFromName } from "../../utils/codeFromName.js";
import type { CreateDepartmentBody, UpdateDepartmentBody } from "./departmentSchemas.js";

export async function listDepartments() {
  return prisma.department.findMany({
    where: { isDeleted: false },
    orderBy: { name: "asc" },
  });
}

export async function getDepartmentById(id: string) {
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept || dept.isDeleted) throw notFound("Department not found");
  return dept;
}

/** 409 if another active department already uses this code (case-insensitive). */
async function assertDepartmentCodeAvailable(code: string, excludeId?: string) {
  if (!code) return;
  const existing = await prisma.department.findFirst({
    where: {
      isDeleted: false,
      code: { equals: code, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { name: true },
  });
  if (existing) {
    throw conflict(
      `The code "${code}" is already used by "${existing.name}". End the department name with a unique shorthand in parentheses, e.g. "Computer Engineering Department (CPE)".`
    );
  }
}

export async function createDepartment(body: CreateDepartmentBody) {
  const code = codeFromName(body.name);
  await assertDepartmentCodeAvailable(code);
  return prisma.department.create({ data: { name: body.name, code, collegeId: body.collegeId } });
}

export async function updateDepartment(id: string, body: UpdateDepartmentBody) {
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) throw notFound("Department not found");
  if (dept.isDeleted) throw badRequest("Cannot update a deleted department. Restore it from Trash first.");
  const name = body.name ?? dept.name;
  // An explicit "(CODE)" in the name wins; otherwise keep the existing code instead of regenerating it.
  const code = explicitCodeFromName(name) ?? dept.code ?? codeFromName(name);
  if (code !== dept.code) await assertDepartmentCodeAvailable(code, id);
  return prisma.department.update({
    where: { id },
    data: { name: body.name ?? undefined, code },
  });
}

export async function softDeleteDepartment(id: string) {
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) throw notFound("Department not found");
  if (dept.isDeleted) throw badRequest("Department is already deleted");
  await prisma.department.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

export async function listTrashDepartments() {
  return prisma.department.findMany({
    where: { isDeleted: true },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreDepartment(id: string) {
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) throw notFound("Department not found");
  if (!dept.isDeleted) throw badRequest("Department is not in trash");
  await prisma.department.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });
}

export async function permanentDeleteDepartment(id: string) {
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) throw notFound("Department not found");
  if (!dept.isDeleted) throw badRequest("Only departments in Trash can be permanently deleted");
  await prisma.department.delete({ where: { id } });
}
