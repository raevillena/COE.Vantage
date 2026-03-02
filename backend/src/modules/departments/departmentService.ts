import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import { codeFromName } from "../../utils/codeFromName.js";
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

export async function createDepartment(body: CreateDepartmentBody) {
  return prisma.department.create({
    data: { name: body.name, code: codeFromName(body.name) },
  });
}

export async function updateDepartment(id: string, body: UpdateDepartmentBody) {
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) throw notFound("Department not found");
  if (dept.isDeleted) throw badRequest("Cannot update a deleted department. Restore it from Trash first.");
  const name = body.name ?? dept.name;
  return prisma.department.update({
    where: { id },
    data: { name: body.name ?? undefined, code: codeFromName(name) },
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
