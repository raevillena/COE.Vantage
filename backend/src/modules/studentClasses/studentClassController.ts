import type { Request, Response } from "express";
import * as studentClassService from "./studentClassService.js";
import type { CreateStudentClassBody, UpdateStudentClassBody } from "./studentClassSchemas.js";

export async function list(_req: Request, res: Response): Promise<void> {
  const list = await studentClassService.listStudentClasses();
  res.json(list);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const c = await studentClassService.getStudentClassById(req.params.id);
  res.json(c);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateStudentClassBody;
  const c = await studentClassService.createStudentClass(body);
  res.status(201).json(c);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateStudentClassBody;
  const c = await studentClassService.updateStudentClass(req.params.id, body);
  res.json(c);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await studentClassService.deleteStudentClass(req.params.id);
  res.status(204).send();
}