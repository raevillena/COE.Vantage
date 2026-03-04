import type { Request, Response } from "express";
import * as academicYearService from "./academicYearService.js";
import type { CreateAcademicYearBody, UpdateAcademicYearBody } from "./academicYearSchemas.js";

export async function list(req: Request, res: Response): Promise<void> {
  const list = await academicYearService.listAcademicYears();
  res.json(list);
}

/** List only active academic years (for schedules/reports). No role restriction beyond auth. */
export async function listActive(_req: Request, res: Response): Promise<void> {
  const list = await academicYearService.listActiveAcademicYears();
  res.json(list);
}

/** List all non-deleted academic years for scheduler dropdown (active year can be labeled "current"). */
export async function listForSchedules(_req: Request, res: Response): Promise<void> {
  const list = await academicYearService.listAcademicYears();
  res.json(list);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const y = await academicYearService.getAcademicYearById(req.params.id);
  res.json(y);
}

export async function getActive(_req: Request, res: Response): Promise<void> {
  const y = await academicYearService.getActiveAcademicYear();
  res.json(y ?? null);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateAcademicYearBody;
  const y = await academicYearService.createAcademicYear(body);
  res.status(201).json(y);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateAcademicYearBody;
  const y = await academicYearService.updateAcademicYear(req.params.id, body);
  res.json(y);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await academicYearService.softDeleteAcademicYear(req.params.id);
  res.status(204).send();
}

export async function listTrash(req: Request, res: Response): Promise<void> {
  const list = await academicYearService.listTrashAcademicYears();
  res.json(list);
}

export async function restore(req: Request, res: Response): Promise<void> {
  await academicYearService.restoreAcademicYear(req.params.id);
  res.status(204).send();
}

export async function permanentDelete(req: Request, res: Response): Promise<void> {
  await academicYearService.permanentDeleteAcademicYear(req.params.id);
  res.status(204).send();
}