import bcrypt from "bcrypt";
import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import type { CreateUserBody, UpdateUserBody, ListUsersQuery } from "./userSchemas.js";

export async function listUsers(query: ListUsersQuery) {
  const where: { role?: typeof query.role; departmentId?: string } = {};
  if (query.role) where.role = query.role;
  if (query.departmentId) where.departmentId = query.departmentId;
  return prisma.user.findMany({
    where,
    select: { id: true, email: true, name: true, role: true, departmentId: true, createdAt: true, department: { select: { name: true, code: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, departmentId: true, createdAt: true, department: { select: { name: true, code: true } } },
  });
  if (!user) throw notFound("User not found");
  return user;
}

export async function createUser(body: CreateUserBody) {
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw badRequest("Email already registered");
  if (body.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!dept) throw badRequest("Department not found");
  }
  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash,
      name: body.name,
      role: body.role,
      departmentId: body.departmentId ?? undefined,
    },
    select: { id: true, email: true, name: true, role: true, departmentId: true },
  });
  return user;
}

export async function updateUser(id: string, body: UpdateUserBody) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("User not found");
  if (body.email && body.email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw badRequest("Email already in use");
  }
  if (body.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!dept) throw badRequest("Department not found");
  }
  const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : undefined;
  return prisma.user.update({
    where: { id },
    data: {
      email: body.email,
      name: body.name,
      role: body.role,
      departmentId: body.departmentId ?? undefined,
      ...(passwordHash && { passwordHash }),
    },
    select: { id: true, email: true, name: true, role: true, departmentId: true },
  });
}

export async function deleteUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("User not found");
  await prisma.user.delete({ where: { id } });
}