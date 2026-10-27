import { z } from "zod";

export const importSchema = z.object({
  body: z.object({
    studentClassId: z.string().uuid(),
    academicYearId: z.string().uuid(),
    semester: z.number().int().min(1).max(2),
    blocks: z
      .array(
        z.object({
          key: z.string().min(1).max(80),
          subjectId: z.string().uuid(),
          dayOfWeek: z.number().int().min(1).max(6),
          startTime: z.string().max(8),
          endTime: z.string().max(8),
          roomDisplayName: z.string().max(200).nullable().optional(),
          facultyDisplayName: z.string().max(200).nullable().optional(),
          skip: z.boolean().optional(),
        })
      )
      .min(1)
      .max(400),
  }),
});
export type ImportBody = z.infer<typeof importSchema>["body"];

export const classSubjectsQuerySchema = z.object({
  query: z.object({
    studentClassId: z.string().uuid(),
    academicYearId: z.string().uuid(),
    semester: z.coerce.number().int().min(1).max(2),
  }),
});
export type ClassSubjectsQuery = z.infer<typeof classSubjectsQuerySchema>["query"];

export const parseTextSchema = z.object({ text: z.string().min(1).max(900_000) });
