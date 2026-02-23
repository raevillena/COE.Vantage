import { z } from "zod";

export const createCurriculumSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    departmentId: z.string().uuid().optional().nullable(),
  }),
});

export const updateCurriculumSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    code: z.string().optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
  }),
});

export type CreateCurriculumBody = z.infer<typeof createCurriculumSchema>["body"];
export type UpdateCurriculumBody = z.infer<typeof updateCurriculumSchema>["body"];