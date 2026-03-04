import type { Request, Response } from "express";
import * as curriculumService from "./curriculumService.js";
import * as subjectService from "../subjects/subjectService.js";
import * as importFromImage from "./importFromImage.js";
import type { CreateCurriculumBody, UpdateCurriculumBody, ApplyImportBody } from "./curriculumSchemas.js";
import { forbidden } from "../../utils/errors.js";

function caller(req: Request) {
  return req.user ? { role: req.user.role, departmentId: req.user.departmentId } : undefined;
}

export async function list(req: Request, res: Response): Promise<void> {
  const list = await curriculumService.listCurricula(caller(req));
  res.json(list);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const c = await curriculumService.getCurriculumById(req.params.id);
  if (req.user?.role === "CHAIRMAN" && c.departmentId !== req.user.departmentId) {
    throw forbidden("You can only view curricula for your own department.");
  }
  res.json(c);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateCurriculumBody;
  const c = await curriculumService.createCurriculum(body, caller(req));
  res.status(201).json(c);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateCurriculumBody;
  const c = await curriculumService.updateCurriculum(req.params.id, body, caller(req));
  res.json(c);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await curriculumService.softDeleteCurriculum(req.params.id, caller(req));
  res.status(204).send();
}

export async function listTrash(req: Request, res: Response): Promise<void> {
  const list = await curriculumService.listTrashCurricula();
  res.json(list);
}

export async function restore(req: Request, res: Response): Promise<void> {
  await curriculumService.restoreCurriculum(req.params.id);
  res.status(204).send();
}

export async function permanentDelete(req: Request, res: Response): Promise<void> {
  await curriculumService.permanentDeleteCurriculum(req.params.id);
  res.status(204).send();
}

/** Extract subjects from image (no DB write). Expects req.file from multer (memoryStorage adds buffer). */
export async function extractFromImage(req: Request, res: Response): Promise<void> {
  const file = req.file as (Express.Multer.File & { buffer?: Buffer }) | undefined;
  const buffer = file?.buffer;
  if (!buffer) {
    res.status(400).json({ error: "No image file uploaded. Use multipart field 'image'." });
    return;
  }
  const result = await importFromImage.extractFromImage(buffer, file.mimetype || "image/png");
  res.json(result);
}

/** Apply imported subjects (create/update). Body: { curriculumId, subjects }. */
export async function applyImport(req: Request, res: Response): Promise<void> {
  const { curriculumId, subjects } = req.body as ApplyImportBody;
  if (req.user?.role === "CHAIRMAN") {
    const c = await curriculumService.getCurriculumById(curriculumId);
    if (c.departmentId !== req.user.departmentId) {
      throw forbidden("You can only import subjects into curricula for your own department.");
    }
  }
  const result = await importFromImage.applyImport(curriculumId, subjects);
  res.json(result);
}

/** Get subjects for a curriculum (for viewer). Same view scope as getById. */
export async function getCurriculumSubjects(req: Request, res: Response): Promise<void> {
  const c = await curriculumService.getCurriculumById(req.params.id);
  if (req.user?.role === "CHAIRMAN" && c.departmentId !== req.user.departmentId) {
    throw forbidden("You can only view curricula for your own department.");
  }
  const subjects = await subjectService.listSubjectsByCurriculumId(req.params.id);
  res.json(subjects);
}

/** Clear curriculum: unassign all subjects (they remain in the system). */
export async function clearCurriculum(req: Request, res: Response): Promise<void> {
  await curriculumService.clearCurriculum(req.params.id, caller(req));
  res.status(204).send();
}