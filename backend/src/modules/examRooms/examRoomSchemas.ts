import { z } from "zod";

const kind = z.enum(["MIDTERM", "FINAL"]);
/** A calendar date, "2026-12-14". */
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-14");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 13:30");

/** Which term a read is about; `kind` narrows to one exam round. */
export const examTermQuerySchema = z.object({
  query: z.object({
    academicYearId: z.string().uuid(),
    semester: z.coerce.number().int().min(1).max(3),
    kind: kind.optional(),
  }),
});

/** Sets the dates of an exam round. The college secretary means their own college; the admin names it. */
export const setExamPeriodSchema = z.object({
  body: z.object({
    academicYearId: z.string().uuid(),
    semester: z.number().int().min(1).max(3),
    kind,
    startDate: ymd,
    endDate: ymd,
    collegeId: z.string().uuid().optional(),
  }),
});

export const openExamPeriodSchema = z.object({ body: z.object({ open: z.boolean() }) });

export const createExamReservationSchema = z.object({
  body: z.object({
    academicYearId: z.string().uuid(),
    semester: z.number().int().min(1).max(3),
    kind,
    roomId: z.string().uuid(),
    subjectId: z.string().uuid(),
    studentClassId: z.string().uuid(),
    date: ymd,
    startTime: hhmm,
    endTime: hhmm,
  }),
});

export const requestRemovalSchema = z.object({ body: z.object({ message: z.string().trim().max(500).optional() }) });

export const respondRemovalSchema = z.object({ body: z.object({ accept: z.boolean(), note: z.string().trim().max(500).optional() }) });

export type SetExamPeriodBody = z.infer<typeof setExamPeriodSchema>["body"];
export type CreateExamReservationBody = z.infer<typeof createExamReservationSchema>["body"];
export type ExamTermQuery = z.infer<typeof examTermQuerySchema>["query"];
