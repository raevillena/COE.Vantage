import { z } from "zod";

export const createAcademicYearSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1),
  }),
});

export const updateAcademicYearSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).optional(),
  }),
});

export const setCurrentTermSchema = z.object({
  body: z.object({
    /** null = this college has not started. */
    academicYearId: z.string().uuid().nullable(),
    semester: z.number().int().min(1).max(3).optional(),
    /** The admin says which college; a college secretary always means their own. */
    collegeId: z.string().uuid().optional(),
  }),
});

export const setTermLockSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    semester: z.number().int().min(1).max(3),
    locked: z.boolean(),
    /** The admin says which college; a dean or college secretary always means their own. */
    collegeId: z.string().uuid().optional(),
  }),
});
export type SetTermLockBody = z.infer<typeof setTermLockSchema>["body"];

export type SetCurrentTermBody = z.infer<typeof setCurrentTermSchema>["body"];
export type CreateAcademicYearBody = z.infer<typeof createAcademicYearSchema>["body"];
export type UpdateAcademicYearBody = z.infer<typeof updateAcademicYearSchema>["body"];