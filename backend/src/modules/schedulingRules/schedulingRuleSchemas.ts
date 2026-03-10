import { z } from "zod";

const configSchema = z.object({
  workStartMinutes: z.number().int().min(0).max(24 * 60),
  workEndMinutes: z.number().int().min(0).max(24 * 60),
  lunchStartMinutes: z.number().int().min(0).max(24 * 60),
  lunchEndMinutes: z.number().int().min(0).max(24 * 60),
  slotStepMinutes: z.number().int().min(5).max(60),
  avoidLunchSpan: z.boolean(),
  preferMwfFor3UnitLecture: z.boolean(),
  preferTthFor3UnitLecture: z.boolean(),
  preferRandom3DayFor3UnitLecture: z.boolean().optional(),
  requireLabBreakAfterLongLab: z.boolean().optional(),
  maxBlockMinutes: z.number().int().min(60).max(480),
  excludedDays: z.array(z.number().int().min(1).max(6)).optional(),
});

export const createSchedulingRuleSetSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    // Description is optional and may be null when the frontend sends `null` for "no description".
    description: z.string().max(500).optional().nullable(),
    config: configSchema,
  }),
});

export const updateSchedulingRuleSetSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional().nullable(),
    config: configSchema.optional(),
  }),
});

export const deleteSchedulingRuleSetSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const getRuleSetSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const resolveRuleSetSchema = z.object({
  query: z.object({
    academicYearId: z.string().uuid(),
    studentClassId: z.string().uuid(),
  }),
});

export const setAssignmentSchema = z.object({
  body: z.object({
    academicYearId: z.string().uuid().optional().nullable(),
    studentClassId: z.string().uuid().optional().nullable(),
    ruleSetId: z.string().uuid(),
  }),
});

export const removeAssignmentSchema = z.object({
  body: z.object({
    academicYearId: z.string().uuid().optional().nullable(),
    studentClassId: z.string().uuid().optional().nullable(),
  }),
});
