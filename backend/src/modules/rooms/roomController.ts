import type { Request, Response } from "express";
import * as roomService from "./roomService.js";
import type { CreateRoomBody, UpdateRoomBody, ListRoomsQuery } from "./roomSchemas.js";

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
  const room = await roomService.updateRoom(req.params.id, body);
  res.json(room);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await roomService.deleteRoom(req.params.id);
  res.status(204).send();
}