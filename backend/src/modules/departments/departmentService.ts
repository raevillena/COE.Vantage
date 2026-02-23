import { prisma } from "../../prisma/client.js";
import { notFound } from "../../utils/errors.js";
import type { CreateDepartmentBody, UpdateDepartmentBody } from "./departmentSchemas.js";

export async function listDepartments() {
  return prisma.department.findMany({ orderBy: { name: "asc" } });
}

export async function getDepartmentById(id: string) {
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) throw notFound("Department not found");
  return dept;
}

export async function createDepartment(body: CreateDepartmentBody) {
  return prisma.department.create({
    data: { name: body.name, code: body.code },
  });
}

export async function updateDepartment(id: string, body: UpdateDepartmentBody) {
  await getDepartmentById(id);
  return prisma.department.update({
    where: { id },
    data: { name: body.name, code: body.code ?? undefined },
  });
}

export async function deleteDepartment(id: string) {
  await getDepartmentById(id);
  await prisma.department.delete({ where: { id } });
}
