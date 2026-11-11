import { z } from "zod";
import { Role } from "@prisma/client";

const roleEnum = z.nativeEnum(Role);
const experimentalFeatureKeyEnum = z.enum(["gradeModule", "mmsuGradePush"]);

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(1, "Password required"),
  }),
});

export const emailPreferencesSchema = z.object({
  body: z
    .object({ digest: z.boolean().optional(), deadlines: z.boolean().optional() })
    .refine((b) => b.digest !== undefined || b.deadlines !== undefined, { message: "Nothing to change" }),
});

export const emailDigestSchema = z.object({
  body: z.object({ enabled: z.boolean() }),
});

export const googleLoginSchema = z.object({
  body: z.object({
    credential: z.string().min(20).max(5000),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    name: z.string().min(1, "Name required"),
    role: roleEnum,
    departmentId: z.string().uuid().optional().nullable(),
  }),
});

export type GoogleLoginBody = z.infer<typeof googleLoginSchema>["body"];
export type LoginBody = z.infer<typeof loginSchema>["body"];
export type RegisterBody = z.infer<typeof registerSchema>["body"];

export const requestPasswordResetSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "Current password required"),
  }),
});

export const sendPasswordResetEmailSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email"),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
  }),
});

export const updateExperimentalFeaturesSchema = z.object({
  body: z
    .object({
      enabled: z.boolean().optional(),
      features: z.array(experimentalFeatureKeyEnum).optional(),
    })
    .refine((value) => value.enabled !== undefined || value.features !== undefined, {
      message: "At least one field is required",
    }),
});

export const setExperimentalGrantsSchema = z.object({
  body: z.object({ granted: z.array(experimentalFeatureKeyEnum) }),
});

export type RequestPasswordResetBody = z.infer<typeof requestPasswordResetSchema>["body"];
export type SendPasswordResetEmailBody = z.infer<typeof sendPasswordResetEmailSchema>["body"];
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>["body"];
export type UpdateExperimentalFeaturesBody = z.infer<typeof updateExperimentalFeaturesSchema>["body"];
