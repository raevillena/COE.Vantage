import type { Request, Response } from "express";
import * as curriculumService from "./curriculumService.js";
import type { CreateCurriculumBody, UpdateCurriculumBody } from "./curriculumSchemas.js";

export async function list(_req: Request, res: Response): Promise<void> {
  const list = await curriculumService.listCurricula();
  res.json(list);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const c = await curriculumService.getCurriculumById(req.params.id);
  res.json(c);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateCurriculumBody;
  const c = await curriculumService.createCurriculum(body);
  res.status(201).json(c);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateCurriculumBody;
  const c = await curriculumService.updateCurriculum(req.params.id, body);
  res.json(c);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await curriculumService.deleteCurriculum(req.params.id);
  res.status(204).send();
}