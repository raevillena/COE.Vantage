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
import { audit, audited } from "../audit/auditService.js";
import { prisma } from "../../prisma/client.js";
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
  const set = await audited({ entityType: "SCHEDULING_RULE", model: "schedulingRuleSet", action: "CREATE", label: (r) => String(r.name) }, () => createRuleSet(body, caller));
  res.status(201).json(set);
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = (req.params as { id: string }).id;
  const body = req.body as { name?: string; description?: string | null; config?: SchedulingRuleSetConfig };
  const caller = getCaller(req);
  const set = await audited({ entityType: "SCHEDULING_RULE", model: "schedulingRuleSet", action: "UPDATE", id: id, fields: ["name", "description", "config"], label: (r) => String(r.name) }, () => updateRuleSet(id, body, caller));
  res.json(set);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const id = (req.params as { id: string }).id;
  const caller = getCaller(req);
  await audited({ entityType: "SCHEDULING_RULE", model: "schedulingRuleSet", action: "PERMANENT_DELETE", id: id, label: (r) => String(r.name) }, () => deleteRuleSet(id, caller));
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
  const [set, year, cls] = await Promise.all([
    prisma.schedulingRuleSet.findUnique({ where: { id: body.ruleSetId }, select: { name: true } }),
    body.academicYearId ? prisma.academicYear.findUnique({ where: { id: body.academicYearId }, select: { name: true } }) : null,
    body.studentClassId ? prisma.studentClass.findUnique({ where: { id: body.studentClassId }, select: { name: true } }) : null,
  ]);
  await audit({
    entityType: "SCHEDULING_RULE",
    entityId: body.ruleSetId,
    entityLabel: set?.name ?? null,
    action: "UPDATE",
    summary: `Assigned scheduling rule ${set?.name ?? ""} to ${[cls?.name, year?.name].filter(Boolean).join(", ") || "the whole college"}`,
    academicYearId: body.academicYearId ?? null,
  });
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
