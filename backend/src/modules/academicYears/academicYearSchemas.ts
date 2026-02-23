import { z } from "zod";

export const createAcademicYearSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    isActive: z.boolean().optional().default(false),
  }),
});

export const updateAcademicYearSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  }),
});

export type CreateAcademicYearBody = z.infer<typeof createAcademicYearSchema>["body"];
export type UpdateAcademicYearBody = z.infer<typeof updateAcademicYearSchema>["body"];