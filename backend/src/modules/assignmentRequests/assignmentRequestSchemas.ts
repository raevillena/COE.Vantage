import { z } from "zod";

const timeString = z.string().regex(/^\d{1,2}:\d{2}$/, "Time must be HH:mm");

export const createAssignmentRequestSchema = z.object({
  body: z.object({
    facultyId: z.string().uuid(),
    subjectId: z.string().uuid(),
    studentClassId: z.string().uuid(),
    roomId: z.string().uuid().optional().nullable(),
    roomDisplayName: z.string().max(500).optional().nullable(),
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: timeString,
    endTime: timeString,
    semester: z.number().int().min(1).max(2),
    academicYearId: z.string().uuid(),
  }),
});

export const listAssignmentRequestsQuerySchema = z.object({
  query: z.object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    /** When provided with academicYearId and semester, return PENDING requests for this class (for schedule display). */
    studentClassId: z.string().uuid().optional(),
    academicYearId: z.string().uuid().optional(),
    semester: z.coerce.number().int().min(1).max(2).optional(),
  }),
});

export const respondAssignmentRequestSchema = z.object({
  body: z.object({
    notes: z.string().max(1000).optional().nullable(),
  }),
});

export type CreateAssignmentRequestBody = z.infer<typeof createAssignmentRequestSchema>["body"];
export type ListAssignmentRequestsQuery = z.infer<typeof listAssignmentRequestsQuerySchema>["query"];
export type RespondAssignmentRequestBody = z.infer<typeof respondAssignmentRequestSchema>["body"];
