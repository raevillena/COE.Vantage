import { z } from "zod";

export const createSubjectSchema = z.object({
  body: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    units: z.number().int().min(0),
    isLab: z.boolean().optional().default(false),
    curriculumId: z.string().uuid().optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
  }),
});

export const updateSubjectSchema = z.object({
  body: z.object({
    code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    units: z.number().int().min(0).optional(),
    isLab: z.boolean().optional(),
    curriculumId: z.string().uuid().optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
  }),
});

export type CreateSubjectBody = z.infer<typeof createSubjectSchema>["body"];
export type UpdateSubjectBody = z.infer<typeof updateSubjectSchema>["body"];