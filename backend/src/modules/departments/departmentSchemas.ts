import { z } from "zod";

export const createDepartmentSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name required"),
    code: z.string().optional(),
  }),
});

export const updateDepartmentSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    code: z.string().optional().nullable(),
  }),
  params: z.object({ id: z.string().uuid() }),
});

export const getDepartmentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export type CreateDepartmentBody = z.infer<typeof createDepartmentSchema>["body"];
export type UpdateDepartmentBody = z.infer<typeof updateDepartmentSchema>["body"];
export type DepartmentParams = z.infer<typeof updateDepartmentSchema>["params"];
