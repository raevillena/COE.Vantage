import { prisma } from "../../prisma/client.js";
import { badRequest, notFound, forbidden } from "../../utils/errors.js";
import type { CreateRoomBody, UpdateRoomBody, ListRoomsQuery, SetRoomAvailabilityBody } from "./roomSchemas.js";

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

export async function createRoom(body: CreateRoomBody) {
  const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
  if (!dept) throw badRequest("Department not found");
  if (body.controlDepartmentId) {
    const controlDept = await prisma.department.findUnique({ where: { id: body.controlDepartmentId } });
    if (!controlDept || controlDept.isDeleted) throw badRequest("Control department not found");
  }
  return prisma.room.create({
    data: {
      name: body.name,
      capacity: body.capacity,
      hasComputer: body.hasComputer ?? false,
      isLab: body.isLab ?? false,
      hasAC: body.hasAC ?? false,
      departmentId: body.departmentId,
      controlDepartmentId: body.controlDepartmentId ?? undefined,
    },
    include: {
      department: { select: { id: true, name: true, code: true } },
      controlDepartment: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function updateRoom(id: string, body: UpdateRoomBody) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw notFound("Room not found");
  if (room.isDeleted) throw badRequest("Cannot update a deleted room. Restore it from Trash first.");
  if (body.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!dept) throw badRequest("Department not found");
  }
  if (body.controlDepartmentId !== undefined && body.controlDepartmentId !== null) {
    const controlDept = await prisma.department.findUnique({ where: { id: body.controlDepartmentId } });
    if (!controlDept || controlDept.isDeleted) throw badRequest("Control department not found");
  }
  return prisma.room.update({
    where: { id },
    data: body,
    include: {
      department: { select: { id: true, name: true, code: true } },
      controlDepartment: { select: { id: true, name: true, code: true } },
    },
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

/** Set room open/closed for a term. Only chairman of room's control department (or ADMIN/DEAN) can open. */
export async function setRoomTermAvailability(
  roomId: string,
  body: SetRoomAvailabilityBody,
  caller: { role: string; departmentId: string | null }
) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { controlDepartment: true },
  });
  if (!room || room.isDeleted) throw notFound("Room not found");
  if (body.isOpen && room.controlDepartmentId) {
    if (caller.role === "CHAIRMAN" && caller.departmentId !== room.controlDepartmentId) {
      throw forbidden("Only the control department chairman can open this room for other departments");
    }
  }
  const row = await prisma.roomTermAvailability.upsert({
    where: { roomId_academicYearId_semester: { roomId, academicYearId: body.academicYearId, semester: body.semester } },
    create: { roomId, academicYearId: body.academicYearId, semester: body.semester, isOpen: body.isOpen },
    update: { isOpen: body.isOpen },
  });
  return row;
}