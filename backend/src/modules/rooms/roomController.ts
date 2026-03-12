import type { Request, Response } from "express";
import * as roomService from "./roomService.js";
import type { CreateRoomBody, UpdateRoomBody, ListRoomsQuery, SetRoomAvailabilityBody } from "./roomSchemas.js";

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
  const room = await roomService.createRoom(body);
  res.status(201).json(room);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateRoomBody;
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : { role: "", departmentId: null };
  const room = await roomService.updateRoom(req.params.id, body, caller);
  res.json(room);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await roomService.softDeleteRoom(req.params.id);
  res.status(204).send();
}

export async function listTrash(req: Request, res: Response): Promise<void> {
  const list = await roomService.listTrashRooms();
  res.json(list);
}

export async function restore(req: Request, res: Response): Promise<void> {
  await roomService.restoreRoom(req.params.id);
  res.status(204).send();
}

export async function permanentDelete(req: Request, res: Response): Promise<void> {
  await roomService.permanentDeleteRoom(req.params.id);
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
  res.json(result);
}

export async function getAvailabilityMap(req: Request, res: Response): Promise<void> {
  const { academicYearId, semester } = req.query as { academicYearId: string; semester: string };
  const map = await roomService.getRoomAvailabilityMap(academicYearId, Number(semester));
  res.json(map);
}