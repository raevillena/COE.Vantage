import type { Request, Response } from "express";
import {
  listRuleSets,
  getRuleSetById,
  createRuleSet,
  updateRuleSet,
  deleteRuleSet,
  listAssignments,
  setAssignment,
  removeAssignment,
  resolveRuleSetFor,
} from "./schedulingRuleService.js";
import type { SchedulingRuleSetConfig } from "./schedulingRuleTypes.js";

function getCaller(req: Request): { role: string; departmentId: string | null } {
  const user = req.user;
  return {
    role: user?.role ?? "FACULTY",
    departmentId: user?.departmentId ?? null,
  };
}

export async function list(req: Request, res: Response): Promise<void> {
  const caller = getCaller(req);
  const sets = await listRuleSets(caller);
  res.json(sets);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const id = (req.params as { id: string }).id;
  const caller = getCaller(req);
  const set = await getRuleSetById(id, caller);
  res.json(set);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = (req.body as { name: string; description?: string; config: SchedulingRuleSetConfig });
  const caller = getCaller(req);
  const set = await createRuleSet(body, caller);
  res.status(201).json(set);
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = (req.params as { id: string }).id;
  const body = req.body as { name?: string; description?: string | null; config?: SchedulingRuleSetConfig };
  const caller = getCaller(req);
  const set = await updateRuleSet(id, body, caller);
  res.json(set);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const id = (req.params as { id: string }).id;
  const caller = getCaller(req);
  await deleteRuleSet(id, caller);
  res.status(204).send();
}

export async function listAssignmentsHandler(req: Request, res: Response): Promise<void> {
  const caller = getCaller(req);
  const assignments = await listAssignments(caller);
  res.json(assignments);
}

export async function setAssignmentHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { academicYearId?: string | null; studentClassId?: string | null; ruleSetId: string };
  const caller = getCaller(req);
  await setAssignment(body, caller);
  res.status(204).send();
}

export async function removeAssignmentHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { academicYearId?: string | null; studentClassId?: string | null };
  const caller = getCaller(req);
  await removeAssignment(body.academicYearId ?? null, body.studentClassId ?? null, caller);
  res.status(204).send();
}

export async function resolve(req: Request, res: Response): Promise<void> {
  const academicYearId = req.query.academicYearId as string | undefined;
  const studentClassId = req.query.studentClassId as string | undefined;
  if (!academicYearId || !studentClassId) {
    res.status(400).json({ message: "academicYearId and studentClassId are required" });
    return;
  }
  const resolved = await resolveRuleSetFor(academicYearId, studentClassId);
  res.json(resolved ?? { ruleSetId: null, config: null });
}
