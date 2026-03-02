import type { Request, Response } from "express";
import * as departmentService from "./departmentService.js";
import type { CreateDepartmentBody, UpdateDepartmentBody, DepartmentParams } from "./departmentSchemas.js";

export async function list(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (user?.role === "CHAIRMAN") {
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
  const dept = await departmentService.createDepartment(body);
  res.status(201).json(dept);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.params as DepartmentParams;
  const body = req.body as UpdateDepartmentBody;
  const dept = await departmentService.updateDepartment(id, body);
  res.json(dept);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.params as DepartmentParams;
  await departmentService.softDeleteDepartment(id);
  res.status(204).send();
}

export async function listTrash(req: Request, res: Response): Promise<void> {
  const list = await departmentService.listTrashDepartments();
  res.json(list);
}

export async function restore(req: Request, res: Response): Promise<void> {
  const { id } = req.params as DepartmentParams;
  await departmentService.restoreDepartment(id);
  res.status(204).send();
}

export async function permanentDelete(req: Request, res: Response): Promise<void> {
  const { id } = req.params as DepartmentParams;
  await departmentService.permanentDeleteDepartment(id);
  res.status(204).send();
}
