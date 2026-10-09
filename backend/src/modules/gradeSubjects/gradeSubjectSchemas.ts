import { z } from "zod";
import { gradingSystemV1PatchSchema, gradingSystemV1Schema } from "../../utils/gradingSystemSchema.js";

const jsonRecordSchema = z.record(z.string(), z.number());

/** Blank or omitted → server generates `GradeRecord.code`. */
const optionalGradeRecordAccessCode = z.preprocess(
  (val) => {
    if (val === undefined || val === null) return undefined;
    if (typeof val === "string" && val.trim() === "") return undefined;
    return typeof val === "string" ? val.trim() : val;
  },
  z.string().min(1).max(80).optional()
);

export const createGradeSubjectSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    /** Treat blank strings like missing code so clients that send "" do not fail Zod. */
    code: z.preprocess(
      (val) => {
        if (val === undefined) return undefined;
        if (val === null) return null;
        if (typeof val === "string" && val.trim() === "") return null;
        return typeof val === "string" ? val.trim() : val;
      },
      z.string().min(1).max(50).optional().nullable()
    ),
    departmentId: z.string().uuid().optional().nullable(),
    gradingSystem: z.union([gradingSystemV1Schema, z.null()]).optional(),
    studentComputeEnabled: z.boolean().optional(),
  }),
});

export const updateGradeSubjectSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    code: z.string().min(1).max(50).optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
    /** Merges shallowly into existing `gradingSystem` on the server; omit keys you are not updating. */
    gradingSystem: z.union([gradingSystemV1PatchSchema, z.null()]).optional(),
    studentComputeEnabled: z.boolean().optional(),
  }),
});

export const upsertViewerSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
    canEdit: z.boolean().optional(),
  }),
});

export const createGradeRecordSchema = z.object({
  body: z.object({
    studentName: z.string().min(1),
    studentNumber: z.string().min(1),
    email: z.string().email().optional().nullable(),
    code: optionalGradeRecordAccessCode,
    grades: jsonRecordSchema,
    maxScores: jsonRecordSchema.optional().nullable(),
  }),
});

export const updateGradeRecordSchema = z.object({
  body: z.object({
    studentName: z.string().min(1).optional(),
    studentNumber: z.string().min(1).optional(),
    email: z.string().email().optional().nullable(),
    code: z.string().min(1).optional(),
    grades: jsonRecordSchema.optional(),
    maxScores: jsonRecordSchema.optional().nullable(),
  }),
});

export const importGradeRecordsSchema = z.object({
  body: z.object({
    records: z.array(
      z.object({
        studentName: z.string().min(1),
        studentNumber: z.string().min(1),
        email: z.string().email().optional().nullable(),
        code: optionalGradeRecordAccessCode,
        grades: jsonRecordSchema,
        maxScores: jsonRecordSchema.optional().nullable(),
      })
    ),
  }),
});

/** Express may pass repeated query keys as `string[]`; coerce to a single string before trim. */
function queryStringish(val: unknown): unknown {
  if (Array.isArray(val)) return val[0];
  return val;
}

const trimmedNonEmpty = (max: number) =>
  z.preprocess(
    (val) => {
      const v = queryStringish(val);
      return typeof v === "string" ? v.trim() : v;
    },
    z.string().min(1).max(max)
  );

export const publicLookupSchema = z.object({
  query: z.object({
    studentNumber: trimmedNonEmpty(80),
    code: trimmedNonEmpty(80),
  }),
});

export const publicComputeRecordParamsSchema = z.object({
  params: z.object({
    recordId: z.string().uuid(),
  }),
});

/** `GET/PATCH/POST …/grade-subjects/:id/records/:recordId…` — both params are UUIDs. */
export const subjectGradeRecordParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    recordId: z.string().uuid(),
  }),
});

export const sendAccessCodesSchema = z.object({
  body: z.object({
    recordIds: z.array(z.string().uuid()).optional(),
  }),
});

export const publicComputeRecordSchema = z.object({
  body: z.object({
    studentNumber: trimmedNonEmpty(80),
    code: trimmedNonEmpty(80),
  }),
});

export const importFromGoogleSheetSchema = z.object({
  body: z.object({
    sheetUrl: z.string().url("Enter a valid Google Sheets URL"),
  }),
});

export type CreateGradeSubjectBody = z.infer<typeof createGradeSubjectSchema>["body"];
export type UpdateGradeSubjectBody = z.infer<typeof updateGradeSubjectSchema>["body"];
export type UpsertViewerBody = z.infer<typeof upsertViewerSchema>["body"];
export type CreateGradeRecordBody = z.infer<typeof createGradeRecordSchema>["body"];
export type UpdateGradeRecordBody = z.infer<typeof updateGradeRecordSchema>["body"];
export type ImportGradeRecordsBody = z.infer<typeof importGradeRecordsSchema>["body"];
export type PublicLookupQuery = z.infer<typeof publicLookupSchema>["query"];
export type SendAccessCodesBody = z.infer<typeof sendAccessCodesSchema>["body"];
export type PublicComputeRecordBody = z.infer<typeof publicComputeRecordSchema>["body"];
export type ImportFromGoogleSheetBody = z.infer<typeof importFromGoogleSheetSchema>["body"];

