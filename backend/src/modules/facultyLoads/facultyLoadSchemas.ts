import { z } from "zod";

const timeString = z.string().regex(/^\d{1,2}:\d{2}$/, "Time must be HH:mm");

const uuidOptional = z.string().uuid().optional().nullable();
const displayNameOptional = z.string().max(500).optional().nullable();

/** Either facultyId (in-system) or facultyDisplayName (Others) must be set. */
const facultyFields = z.object({
  facultyId: uuidOptional,
  facultyDisplayName: displayNameOptional,
}).refine(
  (data) => (data.facultyId != null && data.facultyId !== "") || (data.facultyDisplayName != null && data.facultyDisplayName.trim() !== ""),
  { message: "Either faculty or faculty display name (Others) must be provided" }
).refine(
  (data) => (data.facultyId == null || data.facultyId === "") === (data.facultyDisplayName != null && data.facultyDisplayName.trim() !== ""),
  { message: "Provide either faculty ID or faculty display name, not both" }
);

/** Either roomId (in-system) or roomDisplayName (off-system) must be set. */
const roomFields = z.object({
  roomId: uuidOptional,
  roomDisplayName: displayNameOptional,
}).refine(
  (data) => (data.roomId != null && data.roomId !== "") || (data.roomDisplayName != null && data.roomDisplayName.trim() !== ""),
  { message: "Either room or room display name (off-system) must be provided" }
).refine(
  (data) => (data.roomId == null || data.roomId === "") === (data.roomDisplayName != null && data.roomDisplayName.trim() !== ""),
  { message: "Provide either room ID or room display name, not both" }
);

export const createFacultyLoadSchema = z.object({
  body: z.object({
    facultyId: uuidOptional,
    facultyDisplayName: displayNameOptional,
    subjectId: z.string().uuid(),
    studentClassId: z.string().uuid(),
    roomId: uuidOptional,
    roomDisplayName: displayNameOptional,
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: timeString,
    endTime: timeString,
    semester: z.number().int().min(1).max(2),
    academicYearId: z.string().uuid(),
  }).and(facultyFields).and(roomFields),
});

export const updateFacultyLoadSchema = z.object({
  body: z.object({
    facultyId: uuidOptional,
    facultyDisplayName: displayNameOptional,
    subjectId: z.string().uuid().optional(),
    studentClassId: z.string().uuid().optional(),
    roomId: uuidOptional,
    roomDisplayName: displayNameOptional,
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    semester: z.number().int().min(1).max(2).optional(),
    academicYearId: z.string().uuid().optional(),
  }),
});

/** Payload for preview endpoint; excludeLoadId used when updating to ignore current load. facultyId/roomId null = off-system. */
export const previewFacultyLoadSchema = z.object({
  body: z.object({
    facultyId: uuidOptional,
    facultyDisplayName: displayNameOptional,
    subjectId: z.string().uuid(),
    studentClassId: z.string().uuid(),
    roomId: uuidOptional,
    roomDisplayName: displayNameOptional,
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
    /** Optional: use this rule set for this run instead of the assigned one. */
    ruleSetId: z.string().uuid().optional(),
  }),
});

export const resetFacultyLoadSchema = z.object({
  body: z.object({
    academicYearId: z.string().uuid(),
    semester: z.number().int().min(1).max(2),
    studentClassId: z.string().uuid(),
  }),
});

export const copyFromPreviousFacultyLoadSchema = z.object({
  body: z.object({
    studentClassId: z.string().uuid(),
    sourceAcademicYearId: z.string().uuid(),
    sourceSemester: z.number().int().min(1).max(3),
    targetAcademicYearId: z.string().uuid(),
    targetSemester: z.number().int().min(1).max(3),
  }),
});

export type CreateFacultyLoadBody = z.infer<typeof createFacultyLoadSchema>["body"];
export type UpdateFacultyLoadBody = z.infer<typeof updateFacultyLoadSchema>["body"];
export type PreviewFacultyLoadBody = z.infer<typeof previewFacultyLoadSchema>["body"];
export type AutoAssignFacultyLoadBody = z.infer<typeof autoAssignFacultyLoadSchema>["body"];
export type ResetFacultyLoadBody = z.infer<typeof resetFacultyLoadSchema>["body"];
export type CopyFromPreviousFacultyLoadBody = z.infer<typeof copyFromPreviousFacultyLoadSchema>["body"];