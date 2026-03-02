import { z } from "zod";

const timeString = z.string().regex(/^\d{1,2}:\d{2}$/, "Time must be HH:mm");

export const createFacultyLoadSchema = z.object({
  body: z.object({
    facultyId: z.string().uuid(),
    subjectId: z.string().uuid(),
    studentClassId: z.string().uuid(),
    roomId: z.string().uuid(),
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: timeString,
    endTime: timeString,
    semester: z.number().int().min(1).max(2),
    academicYearId: z.string().uuid(),
  }),
});

export const updateFacultyLoadSchema = z.object({
  body: z.object({
    facultyId: z.string().uuid().optional(),
    subjectId: z.string().uuid().optional(),
    studentClassId: z.string().uuid().optional(),
    roomId: z.string().uuid().optional(),
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    semester: z.number().int().min(1).max(2).optional(),
    academicYearId: z.string().uuid().optional(),
  }),
});

/** Payload for preview endpoint; excludeLoadId used when updating to ignore current load. */
export const previewFacultyLoadSchema = z.object({
  body: z.object({
    facultyId: z.string().uuid(),
    subjectId: z.string().uuid(),
    studentClassId: z.string().uuid(),
    roomId: z.string().uuid(),
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: timeString,
    endTime: timeString,
    semester: z.number().int().min(1).max(2),
    academicYearId: z.string().uuid(),
    excludeLoadId: z.string().uuid().optional(),
  }),
});

export const autoAssignFacultyLoadSchema = z.object({
  body: z.object({
    academicYearId: z.string().uuid(),
    semester: z.number().int().min(1).max(2),
    studentClassId: z.string().uuid(),
  }),
});

export const resetFacultyLoadSchema = z.object({
  body: z.object({
    academicYearId: z.string().uuid(),
    semester: z.number().int().min(1).max(2),
    studentClassId: z.string().uuid(),
  }),
});

export type CreateFacultyLoadBody = z.infer<typeof createFacultyLoadSchema>["body"];
export type UpdateFacultyLoadBody = z.infer<typeof updateFacultyLoadSchema>["body"];
export type PreviewFacultyLoadBody = z.infer<typeof previewFacultyLoadSchema>["body"];
export type AutoAssignFacultyLoadBody = z.infer<typeof autoAssignFacultyLoadSchema>["body"];
export type ResetFacultyLoadBody = z.infer<typeof resetFacultyLoadSchema>["body"];