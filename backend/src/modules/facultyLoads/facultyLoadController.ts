import type { Request, Response } from "express";
import * as facultyLoadService from "./facultyLoadService.js";
import type {
  CreateFacultyLoadBody,
  UpdateFacultyLoadBody,
  PreviewFacultyLoadBody,
  AutoAssignFacultyLoadBody,
  ResetFacultyLoadBody,
} from "./facultyLoadSchemas.js";

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as facultyLoadService.ListFacultyLoadsQuery;
  if (query.semester !== undefined) query.semester = Number(query.semester);
  const list = await facultyLoadService.listFacultyLoads(query);
  res.json(list);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const load = await facultyLoadService.getFacultyLoadById(req.params.id);
  res.json(load);
}

export async function preview(req: Request, res: Response): Promise<void> {
  const body = req.body as PreviewFacultyLoadBody;
  const result = await facultyLoadService.previewFacultyLoad(body);
  res.json(result);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateFacultyLoadBody;
  const load = await facultyLoadService.createFacultyLoad(body);
  res.status(201).json(load);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateFacultyLoadBody;
  const load = await facultyLoadService.updateFacultyLoad(req.params.id, body);
  res.json(load);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await facultyLoadService.deleteFacultyLoad(req.params.id);
  res.status(204).send();
}

export async function autoAssign(req: Request, res: Response): Promise<void> {
  const body = req.body as AutoAssignFacultyLoadBody;
  const created = await facultyLoadService.autoAssignForClass(body.academicYearId, body.semester, body.studentClassId);
  res.status(201).json(created);
}

export async function resetForClass(req: Request, res: Response): Promise<void> {
  const body = req.body as ResetFacultyLoadBody;
  await facultyLoadService.resetForClass(body.academicYearId, body.semester, body.studentClassId);
  res.status(204).send();
}