import type { Request, Response } from "express";
import * as roomService from "./roomService.js";
import { audit, audited } from "../audit/auditService.js";
import { prisma } from "../../prisma/client.js";
import type { CreateRoomBody, UpdateRoomBody, ListRoomsQuery, SetRoomAvailabilityBody, TransferRoomBody } from "./roomSchemas.js";

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListRoomsQuery;
  const list = await roomService.listRooms(query);
  res.json(list);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const room = await roomService.getRoomById(req.params.id);
  res.json(room);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateRoomBody;
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : { role: "", departmentId: null };
  const room = await audited({ entityType: "ROOM", model: "room", action: "CREATE", label: (r) => String(r.name) }, () => roomService.createRoom(body, caller));
  res.status(201).json(room);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateRoomBody;
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : { role: "", departmentId: null };
  const room = await audited({ entityType: "ROOM", model: "room", action: "UPDATE", id: req.params.id, label: (r) => String(r.name) }, () => roomService.updateRoom(req.params.id, body, caller));
  res.json(room);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await audited({ entityType: "ROOM", model: "room", action: "DELETE", id: req.params.id, label: (r) => String(r.name) }, () => roomService.softDeleteRoom(req.params.id));
  res.status(204).send();
}

export async function listTrash(req: Request, res: Response): Promise<void> {
  const list = await roomService.listTrashRooms();
  res.json(list);
}

export async function restore(req: Request, res: Response): Promise<void> {
  await audited({ entityType: "ROOM", model: "room", action: "RESTORE", id: req.params.id, label: (r) => String(r.name) }, () => roomService.restoreRoom(req.params.id));
  res.status(204).send();
}

export async function permanentDelete(req: Request, res: Response): Promise<void> {
  await audited({ entityType: "ROOM", model: "room", action: "PERMANENT_DELETE", id: req.params.id, label: (r) => String(r.name) }, () => roomService.permanentDeleteRoom(req.params.id));
  res.status(204).send();
}

export async function getAvailability(req: Request, res: Response): Promise<void> {
  const { academicYearId, semester } = req.query as { academicYearId: string; semester: string };
  const result = await roomService.getRoomTermAvailability(req.params.id, academicYearId, Number(semester));
  res.json(result);
}

export async function setAvailability(req: Request, res: Response): Promise<void> {
  const body = req.body as SetRoomAvailabilityBody;
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : { role: "", departmentId: null };
  const result = await roomService.setRoomTermAvailability(req.params.id, body, caller);
  const room = await roomService.getRoomById(req.params.id);
  const year = await prisma.academicYear.findUnique({ where: { id: body.academicYearId }, select: { name: true } });
  await audit({
    entityType: "ROOM",
    entityId: req.params.id,
    entityLabel: room.name,
    action: body.isOpen ? "OPEN" : "CLOSE",
    summary: `${body.isOpen ? "Opened" : "Closed"} room ${room.name} for ${year?.name ?? ""}, ${["", "1st Sem", "2nd Sem", "Mid Year"][body.semester] ?? body.semester}`,
    academicYearId: body.academicYearId,
    semester: body.semester,
  });
  res.json(result);
}

export async function getAvailabilityMap(req: Request, res: Response): Promise<void> {
  const { academicYearId, semester } = req.query as { academicYearId: string; semester: string };
  const map = await roomService.getRoomAvailabilityMap(academicYearId, Number(semester));
  res.json(map);
}

export async function transfer(req: Request, res: Response): Promise<void> {
  const body = req.body as TransferRoomBody;
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : { role: "", departmentId: null };
  const room = await audited({ entityType: "ROOM", model: "room", action: "UPDATE", id: req.params.id, label: (r) => String(r.name) }, () => roomService.transferRoom(req.params.id, body, caller));
  res.json(room);
}