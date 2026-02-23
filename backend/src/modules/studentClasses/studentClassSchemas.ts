import { z } from "zod";

export const createStudentClassSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    yearLevel: z.number().int().min(1),
    curriculumId: z.string().uuid(),
    studentCount: z.number().int().min(0),
  }),
});

export const updateStudentClassSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    yearLevel: z.number().int().min(1).optional(),
    curriculumId: z.string().uuid().optional(),
    studentCount: z.number().int().min(0).optional(),
  }),
});

export type CreateStudentClassBody = z.infer<typeof createStudentClassSchema>["body"];
export type UpdateStudentClassBody = z.infer<typeof updateStudentClassSchema>["body"];