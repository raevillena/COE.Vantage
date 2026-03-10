import bcrypt from "bcrypt";
import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import type { CreateUserBody, UpdateUserBody, ListUsersQuery } from "./userSchemas.js";

export async function listUsers(query: ListUsersQuery) {
  const where: { role?: typeof query.role; departmentId?: string; isDeleted: boolean } = { isDeleted: false };
  if (query.role) where.role = query.role;
  if (query.departmentId) where.departmentId = query.departmentId;
  return prisma.user.findMany({
    where,
    select: { id: true, email: true, name: true, role: true, departmentId: true, status: true, maxUnits: true, createdAt: true, department: { select: { name: true, code: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, departmentId: true, status: true, maxUnits: true, createdAt: true, isDeleted: true, department: { select: { name: true, code: true } } },
  });
  if (!user || user.isDeleted) throw notFound("User not found");
  const { isDeleted: _d, ...rest } = user;
  return rest;
}

export async function createUser(body: CreateUserBody) {
  const existing = await prisma.user.findFirst({ where: { email: body.email, isDeleted: false } });
  if (existing) throw badRequest("Email already registered");
  if (body.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!dept || dept.isDeleted) throw badRequest("Department not found");
  }
  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash,
      name: body.name,
      role: body.role,
      departmentId: body.departmentId ?? undefined,
      status: body.status ?? undefined,
      maxUnits: body.maxUnits ?? undefined,
    },
    select: { id: true, email: true, name: true, role: true, departmentId: true, status: true, maxUnits: true },
  });
  return user;
}

export async function updateUser(id: string, body: UpdateUserBody) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("User not found");
  if (user.isDeleted) throw badRequest("Cannot update a deleted user. Restore from Trash first.");
  if (body.email && body.email !== user.email) {
    const existing = await prisma.user.findFirst({ where: { email: body.email, isDeleted: false } });
    if (existing) throw badRequest("Email already in use");
  }
  if (body.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!dept || dept.isDeleted) throw badRequest("Department not found");
  }
  return prisma.user.update({
    where: { id },
    data: {
      email: body.email,
      name: body.name,
      role: body.role,
      departmentId: body.departmentId ?? undefined,
      ...(body.status !== undefined && { status: body.status }),
      ...(body.maxUnits !== undefined && { maxUnits: body.maxUnits }),
    },
    select: { id: true, email: true, name: true, role: true, departmentId: true, status: true, maxUnits: true },
  });
}

export async function softDeleteUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("User not found");
  if (user.isDeleted) throw badRequest("User is already deleted");
  await prisma.user.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

export async function listTrashUsers() {
  return prisma.user.findMany({
    where: { isDeleted: true },
    select: { id: true, email: true, name: true, role: true, departmentId: true, status: true, deletedAt: true, department: { select: { name: true, code: true } } },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("User not found");
  if (!user.isDeleted) throw badRequest("User is not in trash");
  await prisma.user.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });
}

export async function permanentDeleteUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("User not found");
  if (!user.isDeleted) throw badRequest("Only users in Trash can be permanently deleted");
  await prisma.user.delete({ where: { id } });
}

/** Subjects this user is prioritized to teach (for faculty prioritization view). */
export async function getPrioritizedSubjects(facultyId: string) {
  const user = await prisma.user.findUnique({ where: { id: facultyId } });
  if (!user || user.isDeleted) throw notFound("User not found");
  const list = await prisma.subjectFacultyPriority.findMany({
    where: { facultyId },
    orderBy: { priority: "asc" },
    include: {
      subject: {
        select: { id: true, code: true, name: true, units: true, isLab: true },
      },
    },
  });
  return list.map((p) => ({
    subjectId: p.subjectId,
    priority: p.priority,
    code: p.subject.code,
    name: p.subject.name,
    units: p.subject.units,
    isLab: p.subject.isLab,
  }));
}