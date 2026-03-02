import type { Request, Response } from "express";
import * as subjectService from "./subjectService.js";
import type { CreateSubjectBody, UpdateSubjectBody, PutPrioritizedFacultyBody } from "./subjectSchemas.js";

function caller(req: Request) {
  return req.user ? { role: req.user.role, departmentId: req.user.departmentId } : undefined;
}

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
  await subjectService.softDeleteSubject(req.params.id);
  res.status(204).send();
}

export async function listTrash(req: Request, res: Response): Promise<void> {
  const list = await subjectService.listTrashSubjects();
  res.json(list);
}

export async function restore(req: Request, res: Response): Promise<void> {
  await subjectService.restoreSubject(req.params.id);
  res.status(204).send();
}

export async function permanentDelete(req: Request, res: Response): Promise<void> {
  await subjectService.permanentDeleteSubject(req.params.id);
  res.status(204).send();
}

export async function getPrioritizedFaculty(req: Request, res: Response): Promise<void> {
  const list = await subjectService.getPrioritizedFaculty(req.params.id);
  res.json(list);
}

export async function putPrioritizedFaculty(req: Request, res: Response): Promise<void> {
  const body = req.body as PutPrioritizedFacultyBody;
  const list = await subjectService.setPrioritizedFaculty(req.params.id, body.facultyIds, caller(req));
  res.json(list);
}