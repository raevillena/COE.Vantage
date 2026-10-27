import { z } from "zod";

export const FEEDBACK_TYPES = ["BUG", "CHANGE", "IDEA"] as const;
export const FEEDBACK_STATUSES = ["NEW", "PLANNED", "DONE", "DECLINED"] as const;

/** Fields arrive as multipart text, so they are validated after multer has parsed the form. */
export const createFeedbackSchema = z.object({
  body: z.object({
    page: z.string().trim().min(1, "Choose the page or section").max(60),
    type: z.enum(FEEDBACK_TYPES),
    title: z.string().trim().min(3, "Add a short title").max(120),
    description: z.string().trim().min(5, "Describe what should change").max(4000),
  }),
});
export type CreateFeedbackBody = z.infer<typeof createFeedbackSchema>["body"];

export const listFeedbackQuerySchema = z.object({
  query: z.object({
    status: z.enum(FEEDBACK_STATUSES).optional(),
    type: z.enum(FEEDBACK_TYPES).optional(),
    page: z.string().trim().max(60).optional(),
    q: z.string().trim().max(100).optional(),
    archived: z.enum(["false", "true", "all"]).default("false"),
  }),
});
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>["query"];

export const updateFeedbackSchema = z.object({
  body: z
    .object({
      status: z.enum(FEEDBACK_STATUSES).optional(),
      adminNote: z.string().trim().max(2000).nullable().optional(),
      archived: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, "Nothing to update"),
});
export type UpdateFeedbackBody = z.infer<typeof updateFeedbackSchema>["body"];

export const idParamsSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

export const purgeQuerySchema = z.object({
  query: z.object({
    olderThanMonths: z.coerce.number().int().min(0).max(120).default(6),
    closedOnly: z.enum(["true", "false"]).default("true"),
  }),
});
export type PurgeQuery = z.infer<typeof purgeQuerySchema>["query"];
