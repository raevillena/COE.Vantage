import { prisma } from "../../prisma/client.js";
import { badRequest, notFound, forbidden, conflict } from "../../utils/errors.js";
import { assertTermUnlocked } from "../../utils/termLock.js";
import type { CreateRoomBody, UpdateRoomBody, ListRoomsQuery, SetRoomAvailabilityBody, TransferRoomBody } from "./roomSchemas.js";

type Caller = { role: string; departmentId: string | null };

const normalizeRoomName = (s: string) => s.trim().replace(/\s+/g, " ");

/** 409 if another room (active or in Trash) already uses this name, case-insensitive. */
async function assertRoomNameAvailable(name: string, excludeId?: string) {
  const existing = await prisma.room.findFirst({
    where: {
      name: { equals: normalizeRoomName(name), mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { isDeleted: true },
  });
  if (!existing) return;
  throw conflict(
    existing.isDeleted
      ? `A room named "${normalizeRoomName(name)}" is in Trash. Ask an admin to restore it instead of adding a duplicate.`
      : `A room named "${normalizeRoomName(name)}" already exists.`
  );
}

export async function listRooms(query: ListRoomsQuery) {
  const where: { departmentId?: string; isLab?: boolean; capacity?: { gte: number }; isDeleted: boolean } = {
    isDeleted: false,
  };
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.isLab !== undefined) where.isLab = query.isLab === "true";
  if (query.minCapacity) where.capacity = { gte: parseInt(query.minCapacity, 10) };
  return prisma.room.findMany({
    where,
    include: {
      department: { select: { id: true, name: true, code: true } },
      controlDepartment: { select: { id: true, name: true, code: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function listTrashRooms() {
  return prisma.room.findMany({
    where: { isDeleted: true },
    include: { department: { select: { id: true, name: true, code: true } } },
    orderBy: { deletedAt: "desc" },
  });
}

export async function getRoomById(id: string) {
  const room = await prisma.room.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true, code: true } },
      controlDepartment: { select: { id: true, name: true, code: true } },
    },
  });
  if (!room || room.isDeleted) throw notFound("Room not found");
  return room;
}

export async function createRoom(body: CreateRoomBody, caller: Caller) {
  let departmentId = body.departmentId;
  if (caller.role === "CHAIRMAN") {
    if (!caller.departmentId) throw badRequest("Chairman must belong to a department to add rooms.");
    departmentId = caller.departmentId; // own department only
  }
  const dept = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!dept || dept.isDeleted) throw badRequest("Department not found");
  await assertRoomNameAvailable(body.name);
  return prisma.room.create({
    data: {
      name: normalizeRoomName(body.name),
      capacity: body.capacity,
      hasComputer: body.hasComputer ?? false,
      isLab: body.isLab ?? false,
      hasAC: body.hasAC ?? false,
      departmentId,
    },
    include: { department: { select: { id: true, name: true, code: true } } },
  });
}

export async function updateRoom(id: string, body: UpdateRoomBody, caller: Caller) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw notFound("Room not found");
  if (room.isDeleted) throw badRequest("Cannot update a deleted room. Restore it from Trash first.");

  let data: UpdateRoomBody;
  if (caller.role === "ADMIN") {
    data = body;
  } else if (caller.role === "CHAIRMAN") {
    if (caller.departmentId == null || room.departmentId !== caller.departmentId) {
      throw forbidden("You can only edit rooms in your own department");
    }
    const { departmentId: _d, ...rest } = body; // reassigning goes through transferRoom
    data = rest;
  } else if (caller.role === "DEAN" || caller.role === "OFFICER") {
    const { departmentId: _d, ...rest } = body;
    data = rest;
  } else {
    throw forbidden("You cannot update this room");
  }

  if (data.name !== undefined) {
    data.name = normalizeRoomName(data.name);
    if (data.name.toLowerCase() !== room.name.trim().toLowerCase()) {
      await assertRoomNameAvailable(data.name, id);
    }
  }
  if (data.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!dept || dept.isDeleted) throw badRequest("Department not found");
  }
  return prisma.room.update({
    where: { id },
    data,
    include: { department: { select: { id: true, name: true, code: true } } },
  });
}

export async function softDeleteRoom(id: string) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw notFound("Room not found");
  if (room.isDeleted) throw badRequest("Room is already deleted");
  await prisma.room.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

export async function restoreRoom(id: string) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw notFound("Room not found");
  if (!room.isDeleted) throw badRequest("Room is not in trash");
  await prisma.room.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });
}

export async function permanentDeleteRoom(id: string) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw notFound("Room not found");
  if (!room.isDeleted) throw badRequest("Only rooms in Trash can be permanently deleted");
  await prisma.room.delete({ where: { id } });
}

/** Get room term availability. No row = closed (only control department can assign). */
export async function getRoomTermAvailability(roomId: string, academicYearId: string, semester: number) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.isDeleted) throw notFound("Room not found");
  const row = await prisma.roomTermAvailability.findUnique({
    where: { roomId_academicYearId_semester: { roomId, academicYearId, semester } },
  });
  return { isOpen: row?.isOpen ?? false };
}

/** Get isOpen by roomId for the given term (for scheduler to filter/disable rooms). */
export async function getRoomAvailabilityMap(academicYearId: string, semester: number): Promise<Record<string, boolean>> {
  const rows = await prisma.roomTermAvailability.findMany({
    where: { academicYearId, semester },
    select: { roomId: true, isOpen: true },
  });
  const map: Record<string, boolean> = {};
  for (const r of rows) map[r.roomId] = r.isOpen;
  return map;
}

/** Only the room's own department chairman (or admin/dean) can open OR close it. */
export async function setRoomTermAvailability(roomId: string, body: SetRoomAvailabilityBody, caller: Caller) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.isDeleted) throw notFound("Room not found");
  const allowed =
    caller.role === "ADMIN" ||
    caller.role === "DEAN" ||
    (caller.role === "CHAIRMAN" && caller.departmentId != null && caller.departmentId === room.departmentId);
  if (!allowed) throw forbidden("Only the chairman of the room's department (or an admin/dean) can open or close this room.");
  await assertTermUnlocked(body.academicYearId, body.semester, room.collegeId);
  return prisma.roomTermAvailability.upsert({
    where: { roomId_academicYearId_semester: { roomId, academicYearId: body.academicYearId, semester: body.semester } },
    create: { roomId, academicYearId: body.academicYearId, semester: body.semester, isOpen: body.isOpen },
    update: { isOpen: body.isOpen },
  });
}

/** Admin, dean, or the current owning department's chairman. Open/closed settings and schedules are kept. */
export async function transferRoom(id: string, body: TransferRoomBody, caller: Caller) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room || room.isDeleted) throw notFound("Room not found");
  const allowed =
    caller.role === "ADMIN" ||
    caller.role === "DEAN" ||
    (caller.role === "CHAIRMAN" && caller.departmentId != null && caller.departmentId === room.departmentId);
  if (!allowed) throw forbidden("Only an admin, a dean, or the department that owns this room can transfer it.");
  if (body.departmentId === room.departmentId) throw badRequest("Room already belongs to that department.");
  const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
  if (!dept || dept.isDeleted) throw badRequest("Department not found");
  return prisma.room.update({
    where: { id },
    data: { departmentId: body.departmentId },
    include: { department: { select: { id: true, name: true, code: true } } },
  });
}