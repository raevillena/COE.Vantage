import { z } from "zod";

const term = {
  academicYearId: z.string().uuid(),
  semester: z.number().int().min(1).max(3),
};

export const listDeloadingsQuerySchema = z.object({
  academicYearId: z.string().uuid(),
  semester: z.coerce.number().int().min(1).max(3),
});
export type ListDeloadingsQuery = z.infer<typeof listDeloadingsQuerySchema>;

export const putDeloadingsSchema = z.object({
  body: z.object({
    ...term,
    items: z
      .array(
        z.object({
          description: z.string().trim().min(1, "Describe the deloading").max(200),
          units: z.number().gt(0, "Units must be greater than 0").max(60),
        })
      )
      .max(20),
  }),
});
export type PutDeloadingsBody = z.infer<typeof putDeloadingsSchema>["body"];

export const copyDeloadingsSchema = z.object({
  body: z.object({
    fromAcademicYearId: z.string().uuid(),
    fromSemester: z.number().int().min(1).max(3),
    toAcademicYearId: z.string().uuid(),
    toSemester: z.number().int().min(1).max(3),
    userIds: z.array(z.string().uuid()).optional(),
  }),
});
export type CopyDeloadingsBody = z.infer<typeof copyDeloadingsSchema>["body"];
