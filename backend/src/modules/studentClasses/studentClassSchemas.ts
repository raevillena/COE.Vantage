import { z } from "zod";

export const createStudentClassSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    yearLevel: z.number().int().min(1),
    curriculumId: z.string().uuid(),
    /** One of the curriculum's specializations; omit or null for none. */
    specializationId: z.string().uuid().optional().nullable(),
    studentCount: z.number().int().min(0),
  }),
});

export const updateStudentClassSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    yearLevel: z.number().int().min(1).optional(),
    curriculumId: z.string().uuid().optional(),
    specializationId: z.string().uuid().optional().nullable(),
    studentCount: z.number().int().min(0).optional(),
  }),
});

export type CreateStudentClassBody = z.infer<typeof createStudentClassSchema>["body"];
export type UpdateStudentClassBody = z.infer<typeof updateStudentClassSchema>["body"];