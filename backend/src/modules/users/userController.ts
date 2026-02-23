import type { Request, Response } from "express";
import * as userService from "./userService.js";
import type { CreateUserBody, UpdateUserBody, ListUsersQuery } from "./userSchemas.js";

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListUsersQuery;
  const list = await userService.listUsers(query);
  res.json(list);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const user = await userService.getUserById(req.params.id);
  res.json(user);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateUserBody;
  const user = await userService.createUser(body);
  res.status(201).json(user);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateUserBody;
  const user = await userService.updateUser(req.params.id, body);
  res.json(user);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await userService.deleteUser(req.params.id);
  res.status(204).send();
}