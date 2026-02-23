import type { Request, Response } from "express";
import * as subjectService from "./subjectService.js";
import type { CreateSubjectBody, UpdateSubjectBody } from "./subjectSchemas.js";

export async function list(_req: Request, res: Response): Promise<void> {
  const list = await subjectService.listSubjects();
  res.json(list);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const s = await subjectService.getSubjectById(req.params.id);
  res.json(s);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateSubjectBody;
  const s = await subjectService.createSubject(body);
  res.status(201).json(s);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateSubjectBody;
  const s = await subjectService.updateSubject(req.params.id, body);
  res.json(s);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await subjectService.deleteSubject(req.params.id);
  res.status(204).send();
}