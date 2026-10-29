import type { Request, Response } from "express";
import * as departmentService from "./departmentService.js";
import { audited } from "../audit/auditService.js";
import type { CreateDepartmentBody, UpdateDepartmentBody, DepartmentParams } from "./departmentSchemas.js";

export async function list(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (user?.role === "CHAIRMAN" && req.query.scope !== "all") {
    if (user.departmentId) {
      const dept = await departmentService.getDepartmentById(user.departmentId);
      res.json([dept]);
    } else {
      res.json([]);
    }
    return;
  }
  const listResult = await departmentService.listDepartments();
  res.json(listResult);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as DepartmentParams;
  const user = req.user;
  if (user?.role === "CHAIRMAN" && user.departmentId !== id) {
    res.status(403).json({ message: "You can only access your own department" });
    return;
  }
  const dept = await departmentService.getDepartmentById(id);
  res.json(dept);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateDepartmentBody;
  const dept = await audited({ entityType: "DEPARTMENT", model: "department", action: "CREATE", label: (r) => String(r.name) }, () => departmentService.createDepartment(body));
  res.status(201).json(dept);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.params as DepartmentParams;
  const body = req.body as UpdateDepartmentBody;
  const dept = await audited({ entityType: "DEPARTMENT", model: "department", action: "UPDATE", id: id, label: (r) => String(r.name) }, () => departmentService.updateDepartment(id, body));
  res.json(dept);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.params as DepartmentParams;
  await audited({ entityType: "DEPARTMENT", model: "department", action: "DELETE", id: id, label: (r) => String(r.name) }, () => departmentService.softDeleteDepartment(id));
  res.status(204).send();
}

export async function listTrash(req: Request, res: Response): Promise<void> {
  const list = await departmentService.listTrashDepartments();
  res.json(list);
}

export async function restore(req: Request, res: Response): Promise<void> {
  const { id } = req.params as DepartmentParams;
  await audited({ entityType: "DEPARTMENT", model: "department", action: "RESTORE", id: id, label: (r) => String(r.name) }, () => departmentService.restoreDepartment(id));
  res.status(204).send();
}

export async function permanentDelete(req: Request, res: Response): Promise<void> {
  const { id } = req.params as DepartmentParams;
  await audited({ entityType: "DEPARTMENT", model: "department", action: "PERMANENT_DELETE", id: id, label: (r) => String(r.name) }, () => departmentService.permanentDeleteDepartment(id));
  res.status(204).send();
}
