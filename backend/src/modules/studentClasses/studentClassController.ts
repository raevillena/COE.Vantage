import type { Request, Response } from "express";
import * as studentClassService from "./studentClassService.js";
import type { CreateStudentClassBody, UpdateStudentClassBody } from "./studentClassSchemas.js";

function caller(req: Request) {
  return req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : undefined;
}

export async function list(req: Request, res: Response): Promise<void> {
  const departmentId =
    typeof req.query.departmentId === "string" && req.query.departmentId.trim()
      ? req.query.departmentId
      : undefined;
  const list = await studentClassService.listStudentClasses(caller(req), { departmentId });
  res.json(list);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const c = await studentClassService.getStudentClassById(req.params.id, caller(req));
  res.json(c);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateStudentClassBody;
  const c = await studentClassService.createStudentClass(body, caller(req));
  res.status(201).json(c);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateStudentClassBody;
  const c = await studentClassService.updateStudentClass(req.params.id, body, caller(req));
  res.json(c);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await studentClassService.softDeleteStudentClass(req.params.id, caller(req));
  res.status(204).send();
}

export async function listTrash(req: Request, res: Response): Promise<void> {
  const list = await studentClassService.listTrashStudentClasses(caller(req));
  res.json(list);
}

export async function restore(req: Request, res: Response): Promise<void> {
  await studentClassService.restoreStudentClass(req.params.id, caller(req));
  res.status(204).send();
}

export async function permanentDelete(req: Request, res: Response): Promise<void> {
  await studentClassService.permanentDeleteStudentClass(req.params.id, caller(req));
  res.status(204).send();
}