import { z } from "zod";

export const createSubjectSchema = z.object({
  body: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    units: z.number().int().min(0),
    isLab: z.boolean().optional().default(false),
    yearLevel: z.number().int().min(1).optional().nullable(),
    semester: z.number().int().min(1).max(3).optional().nullable(),
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
    yearLevel: z.number().int().min(1).optional().nullable(),
    semester: z.number().int().min(1).max(3).optional().nullable(),
    curriculumId: z.string().uuid().optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
  }),
});

export type CreateSubjectBody = z.infer<typeof createSubjectSchema>["body"];
export type UpdateSubjectBody = z.infer<typeof updateSubjectSchema>["body"];

export const putPrioritizedFacultySchema = z.object({
  body: z.object({
    facultyIds: z.array(z.string().uuid()),
    academicYearId: z.string().uuid(),
    semester: z.number().int().min(1).max(3),
  }),
});

/** Query for reading possible subjects / prioritized faculty of one term. */
export const prioritizedTermQuerySchema = z.object({
  academicYearId: z.string().uuid(),
  semester: z.coerce.number().int().min(1).max(3),
});

/** Copy possible subjects from one term to another (never overwrites rows already in the target). */
export const copyPrioritizedFacultySchema = z.object({
  body: z.object({
    fromAcademicYearId: z.string().uuid(),
    fromSemester: z.number().int().min(1).max(3),
    toAcademicYearId: z.string().uuid(),
    toSemester: z.number().int().min(1).max(3),
    facultyIds: z.array(z.string().uuid()).optional(),
  }),
});
export type CopyPrioritizedFacultyBody = z.infer<typeof copyPrioritizedFacultySchema>["body"];

export type PutPrioritizedFacultyBody = z.infer<typeof putPrioritizedFacultySchema>["body"];