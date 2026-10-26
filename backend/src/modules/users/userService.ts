import bcrypt from "bcrypt";
import { Role } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { badRequest, notFound, forbidden } from "../../utils/errors.js";
import type { CreateUserBody, UpdateUserBody, ListUsersQuery } from "./userSchemas.js";

export async function listUsers(query: ListUsersQuery) {
  const where: { role?: Role | { in: Role[] }; departmentId?: string; isDeleted: boolean } = { isDeleted: false };
  if (Array.isArray(query.role)) {
    if (query.role.length > 0) where.role = { in: query.role };
  } else if (query.role) {
    where.role = query.role;
  }
  if (query.departmentId) where.departmentId = query.departmentId;
  return prisma.user.findMany({
    where,
    select: { id: true, email: true, name: true, role: true, departmentId: true, status: true, maxUnits: true, createdAt: true, department: { select: { name: true, code: true } } },
    orderBy: { name: "asc" },
  });
}

export async function listAssignableFaculty(callerDepartmentId: string | null) {
  const users = await prisma.user.findMany({
    where: { isDeleted: false, role: { in: [Role.FACULTY, Role.CHAIRMAN, Role.DEAN] } },
    select: {
      id: true,
      name: true,
      role: true,
      departmentId: true,
      department: { select: { name: true, code: true } },
    },
  });

  const bucket = (u: (typeof users)[number]) =>
    callerDepartmentId && u.departmentId === callerDepartmentId ? 0 : u.departmentId ? 1 : 2;

  return users.sort((a, b) => {
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb;
    if (ba === 1) {
      const d = (a.department?.name ?? "").localeCompare(b.department?.name ?? "");
      if (d !== 0) return d;
    }
    return a.name.localeCompare(b.name);
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

export async function updateUser(
  id: string,
  body: UpdateUserBody,
  caller?: { id?: string; role: string; departmentId: string | null }
) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("User not found");
  if (user.isDeleted) throw badRequest("Cannot update a deleted user. Restore from Trash first.");

  if (caller?.role === "CHAIRMAN") {
    const isSelf = caller.id != null && caller.id === user.id;
    const isDeptFaculty = user.role === Role.FACULTY && user.departmentId === caller.departmentId;
    if (caller.departmentId == null || !(isDeptFaculty || isSelf)) {
      throw forbidden("You can only update faculty in your own department, or your own load limits.");
    }
    // Chairman may only change status and max units.
    body = { status: body.status, maxUnits: body.maxUnits };
  }

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
export async function getPrioritizedSubjects(facultyId: string, term: { academicYearId: string; semester: number }) {
  const user = await prisma.user.findUnique({ where: { id: facultyId } });
  if (!user || user.isDeleted) throw notFound("User not found");
  const list = await prisma.subjectFacultyPriority.findMany({
    where: { facultyId, academicYearId: term.academicYearId, semester: term.semester },
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