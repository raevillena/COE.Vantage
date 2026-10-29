import type { Request, Response } from "express";
import * as userService from "./userService.js";
import type { CreateUserBody, UpdateUserBody, ListUsersQuery } from "./userSchemas.js";
import { audited } from "../audit/auditService.js";
import { forbidden, badRequest } from "../../utils/errors.js";

export async function list(req: Request, res: Response): Promise<void> {
  const query = { ...(req.query as unknown as ListUsersQuery) };
  // Chairman sees only users in their department (used by Chairman Faculty page).
  if (req.user?.role === "CHAIRMAN" && req.user.departmentId) {
    query.departmentId = req.user.departmentId;
    if (!query.role) query.role = ["FACULTY", "CHAIRMAN"];
  }
  // A faculty member sees only themselves in people lists (schedule and report dropdowns).
  const list = await userService.listUsers(query, req.user?.role === "FACULTY" ? req.user.id : undefined);
  res.json(list);
}

export async function listAssignableFaculty(req: Request, res: Response): Promise<void> {
  res.json(await userService.listAssignableFaculty(req.user?.departmentId ?? null));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const user = await userService.getUserById(req.params.id);
  res.json(user);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateUserBody;
  if (req.user?.role === "CHAIRMAN") {
    if (!req.user.departmentId) throw forbidden("Chairman must belong to a department to add faculty.");
    if (body.role !== "FACULTY") throw forbidden("Chairman can only add faculty.");
    body.departmentId = req.user.departmentId; // always their own department
  }
  const user = await audited({ entityType: "USER", model: "user", action: "CREATE", label: (r) => `${r.name} (${r.email})` }, () => userService.createUser(body));
  res.status(201).json(user);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateUserBody & { password?: string };
  // Admins must not set another user's password; only email-based reset is allowed.
  if ("password" in body) delete body.password;
  const caller = req.user ? { id: req.user.id, role: req.user.role, departmentId: req.user.departmentId ?? null } : undefined;
  const user = await audited({ entityType: "USER", model: "user", action: "UPDATE", id: req.params.id, fields: ["email", "name", "role", "departmentId", "status", "maxUnits"], label: (r) => `${r.name} (${r.email})` }, () => userService.updateUser(req.params.id, body, caller));
  res.json(user);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await audited({ entityType: "USER", model: "user", action: "DELETE", id: req.params.id, label: (r) => `${r.name} (${r.email})` }, () => userService.softDeleteUser(req.params.id));
  res.status(204).send();
}

export async function listTrash(req: Request, res: Response): Promise<void> {
  const list = await userService.listTrashUsers();
  res.json(list);
}

export async function restore(req: Request, res: Response): Promise<void> {
  await audited({ entityType: "USER", model: "user", action: "RESTORE", id: req.params.id, label: (r) => `${r.name} (${r.email})` }, () => userService.restoreUser(req.params.id));
  res.status(204).send();
}

export async function permanentDelete(req: Request, res: Response): Promise<void> {
  await audited({ entityType: "USER", model: "user", action: "PERMANENT_DELETE", id: req.params.id, label: (r) => `${r.name} (${r.email})` }, () => userService.permanentDeleteUser(req.params.id));
  res.status(204).send();
}

export async function getPrioritizedSubjects(req: Request, res: Response): Promise<void> {
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester);
  if (!academicYearId || ![1, 2, 3].includes(semester)) throw badRequest("academicYearId and semester are required");
  const list = await userService.getPrioritizedSubjects(req.params.id, { academicYearId, semester });
  res.json(list);
}