import { z } from "zod";

export const createCurriculumSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    departmentId: z.string().uuid().optional().nullable(),
  }),
});

export const updateCurriculumSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    departmentId: z.string().uuid().optional().nullable(),
  }),
});

export const applyImportSchema = z.object({
  body: z.object({
    curriculumId: z.string().uuid(),
    subjects: z.array(
      z.object({
        yearLevel: z.number().int().min(1).max(5),
        semester: z.number().int().min(1).max(3).optional(),
        code: z.string().min(1),
        name: z.string().min(1),
        units: z.number().int().min(0),
        prerequisites: z.string().optional(),
        isLab: z.boolean().optional(),
      })
    ),
  }),
});

export type CreateCurriculumBody = z.infer<typeof createCurriculumSchema>["body"];
export type UpdateCurriculumBody = z.infer<typeof updateCurriculumSchema>["body"];
export type ApplyImportBody = z.infer<typeof applyImportSchema>["body"];