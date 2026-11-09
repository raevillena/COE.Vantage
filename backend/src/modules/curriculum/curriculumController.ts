import type { Request, Response } from "express";
import * as curriculumService from "./curriculumService.js";
import * as subjectService from "../subjects/subjectService.js";
import * as applyImportModule from "./applyImport.js";
import type { CreateCurriculumBody, UpdateCurriculumBody, ApplyImportBody } from "./curriculumSchemas.js";
import { audit, audited } from "../audit/auditService.js";
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
  const c = await audited({ entityType: "CURRICULUM", model: "curriculum", action: "CREATE", label: (r) => String(r.name) }, () => curriculumService.createCurriculum(body, caller(req)));
  res.status(201).json(c);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateCurriculumBody;
  const c = await audited({ entityType: "CURRICULUM", model: "curriculum", action: "UPDATE", id: req.params.id, fields: ["name", "code", "departmentId"], label: (r) => String(r.name) }, () => curriculumService.updateCurriculum(req.params.id, body, caller(req)));
  res.json(c);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await audited({ entityType: "CURRICULUM", model: "curriculum", action: "DELETE", id: req.params.id, label: (r) => String(r.name) }, () => curriculumService.softDeleteCurriculum(req.params.id, caller(req)));
  res.status(204).send();
}

export async function listTrash(req: Request, res: Response): Promise<void> {
  const list = await curriculumService.listTrashCurricula();
  res.json(list);
}

export async function restore(req: Request, res: Response): Promise<void> {
  await audited({ entityType: "CURRICULUM", model: "curriculum", action: "RESTORE", id: req.params.id, label: (r) => String(r.name) }, () => curriculumService.restoreCurriculum(req.params.id));
  res.status(204).send();
}

export async function permanentDelete(req: Request, res: Response): Promise<void> {
  await audited({ entityType: "CURRICULUM", model: "curriculum", action: "PERMANENT_DELETE", id: req.params.id, label: (r) => String(r.name) }, () => curriculumService.permanentDeleteCurriculum(req.params.id));
  res.status(204).send();
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
  const result = await applyImportModule.applyImport(curriculumId, subjects);
  const target = await curriculumService.getCurriculumById(curriculumId);
  await audit({
    entityType: "CURRICULUM",
    entityId: curriculumId,
    entityLabel: target.name,
    action: "IMPORT",
    summary: `Imported subjects into curriculum ${target.name}: ${result.created} added, ${result.updated} updated`,
    changes: { subjects: { to: { created: result.created, updated: result.updated, errors: result.errors.length } } },
  });
  res.json(result);
}

/** Get subjects for a curriculum (for viewer). Same view scope as getById. */
export async function getCurriculumSubjects(req: Request, res: Response): Promise<void> {
  const c = await curriculumService.getCurriculumById(req.params.id);
  if (req.user?.role === "CHAIRMAN" && c.departmentId !== req.user.departmentId) {
    throw forbidden("You can only view curricula for your own department.");
  }
  const specializationId = typeof req.query.specializationId === "string" && req.query.specializationId ? req.query.specializationId : undefined;
  const subjects = await subjectService.listSubjectsByCurriculumId(req.params.id, specializationId);
  res.json(subjects);
}

/** Clear curriculum: unassign all subjects (they remain in the system). */
export async function clearCurriculum(req: Request, res: Response): Promise<void> {
  await curriculumService.clearCurriculum(req.params.id, caller(req));
  res.status(204).send();
}

export async function listSpecializations(req: Request, res: Response): Promise<void> {
  res.json(await curriculumService.listSpecializations(req.params.id, caller(req)));
}

export async function createSpecialization(req: Request, res: Response): Promise<void> {
  const spec = await curriculumService.createSpecialization(req.params.id, req.body as { name: string }, caller(req));
  await audit({ entityType: "CURRICULUM", entityId: req.params.id, entityLabel: spec.name, action: "UPDATE", summary: `Added the specialization ${spec.name} to a curriculum` });
  res.status(201).json(spec);
}

export async function updateSpecialization(req: Request, res: Response): Promise<void> {
  const spec = await curriculumService.updateSpecialization(req.params.specId, req.body as { name: string }, caller(req));
  await audit({ entityType: "CURRICULUM", entityId: spec.curriculumId, entityLabel: spec.name, action: "UPDATE", summary: `Renamed a curriculum specialization to ${spec.name}` });
  res.json(spec);
}

export async function deleteSpecialization(req: Request, res: Response): Promise<void> {
  const spec = await curriculumService.deleteSpecialization(req.params.specId, caller(req));
  await audit({ entityType: "CURRICULUM", entityId: spec.curriculumId, entityLabel: spec.name, action: "UPDATE", summary: `Removed the specialization ${spec.name} from a curriculum` });
  res.status(204).send();
}

export async function setSubjectSpecializations(req: Request, res: Response): Promise<void> {
  const result = await curriculumService.setSubjectSpecializations(req.params.id, req.params.subjectId, (req.body as { specializationIds: string[] }).specializationIds, caller(req));
  await audit({ entityType: "CURRICULUM", entityId: req.params.id, action: "UPDATE", summary: `Changed which specializations a curriculum subject belongs to (${result.specializationIds.length === 0 ? "common to all" : `${result.specializationIds.length} specialization(s)`})` });
  res.json(result);
}
