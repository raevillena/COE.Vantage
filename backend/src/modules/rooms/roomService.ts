import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import type { CreateRoomBody, UpdateRoomBody, ListRoomsQuery } from "./roomSchemas.js";

export async function listRooms(query: ListRoomsQuery) {
  const where: { departmentId?: string; isLab?: boolean; capacity?: { gte: number }; isDeleted: boolean } = {
    isDeleted: false,
  };
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.isLab !== undefined) where.isLab = query.isLab === "true";
  if (query.minCapacity) where.capacity = { gte: parseInt(query.minCapacity, 10) };
  return prisma.room.findMany({
    where,
    include: { department: { select: { id: true, name: true, code: true } } },
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
    include: { department: { select: { id: true, name: true, code: true } } },
  });
  if (!room || room.isDeleted) throw notFound("Room not found");
  return room;
}

export async function createRoom(body: CreateRoomBody) {
  const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
  if (!dept) throw badRequest("Department not found");
  return prisma.room.create({
    data: body,
    include: { department: { select: { id: true, name: true, code: true } } },
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
  return prisma.room.update({
    where: { id },
    data: body,
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