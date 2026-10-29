import type { Request, Response } from "express";
import * as academicYearService from "./academicYearService.js";
import { audit, audited } from "../audit/auditService.js";
import type { CreateAcademicYearBody, SetCurrentTermBody, SetTermLockBody, UpdateAcademicYearBody } from "./academicYearSchemas.js";

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
  const y = await audited({ entityType: "ACADEMIC_YEAR", model: "academicYear", action: "CREATE", label: (r) => String(r.name) }, () => academicYearService.createAcademicYear(body));
  res.status(201).json(y);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateAcademicYearBody;
  const y = await audited({ entityType: "ACADEMIC_YEAR", model: "academicYear", action: "UPDATE", id: req.params.id, fields: ["name", "isActive"], label: (r) => String(r.name) }, () => academicYearService.updateAcademicYear(req.params.id, body));
  res.json(y);
}

export async function setCurrentTerm(req: Request, res: Response): Promise<void> {
  res.json(await academicYearService.setCurrentTerm(req.body as SetCurrentTermBody));
}

export async function setTermLock(req: Request, res: Response): Promise<void> {
  const actor = { id: req.user!.id, name: req.user!.name ?? req.user!.email };
  res.json(await academicYearService.setTermLock(req.params.id, req.body as SetTermLockBody, actor));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await audited({ entityType: "ACADEMIC_YEAR", model: "academicYear", action: "DELETE", id: req.params.id, label: (r) => String(r.name) }, () => academicYearService.softDeleteAcademicYear(req.params.id));
  res.status(204).send();
}

export async function listTrash(req: Request, res: Response): Promise<void> {
  const list = await academicYearService.listTrashAcademicYears();
  res.json(list);
}

export async function restore(req: Request, res: Response): Promise<void> {
  await audited({ entityType: "ACADEMIC_YEAR", model: "academicYear", action: "RESTORE", id: req.params.id, label: (r) => String(r.name) }, () => academicYearService.restoreAcademicYear(req.params.id));
  res.status(204).send();
}

export async function permanentDelete(req: Request, res: Response): Promise<void> {
  await audited({ entityType: "ACADEMIC_YEAR", model: "academicYear", action: "PERMANENT_DELETE", id: req.params.id, label: (r) => String(r.name) }, () => academicYearService.permanentDeleteAcademicYear(req.params.id));
  res.status(204).send();
}