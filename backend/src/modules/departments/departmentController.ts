import type { Request, Response } from "express";
import * as departmentService from "./departmentService.js";
import type { CreateDepartmentBody, UpdateDepartmentBody, DepartmentParams } from "./departmentSchemas.js";

export async function list(_req: Request, res: Response): Promise<void> {
  const list = await departmentService.listDepartments();
  res.json(list);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as DepartmentParams;
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
  await departmentService.deleteDepartment(id);
  res.status(204).send();
}
