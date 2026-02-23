import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import type { CreateRoomBody, UpdateRoomBody, ListRoomsQuery } from "./roomSchemas.js";

export async function listRooms(query: ListRoomsQuery) {
  const where: { departmentId?: string; isLab?: boolean; capacity?: { gte: number } } = {};
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.isLab !== undefined) where.isLab = query.isLab === "true";
  if (query.minCapacity) where.capacity = { gte: parseInt(query.minCapacity, 10) };
  return prisma.room.findMany({
    where,
    include: { department: { select: { id: true, name: true, code: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getRoomById(id: string) {
  const room = await prisma.room.findUnique({
    where: { id },
    include: { department: { select: { id: true, name: true, code: true } } },
  });
  if (!room) throw notFound("Room not found");
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

export async function deleteRoom(id: string) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw notFound("Room not found");
  await prisma.room.delete({ where: { id } });
}