import { z } from "zod";
import { Role } from "@prisma/client";

const roleEnum = z.nativeEnum(Role);

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(1, "Password required"),
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

export type RequestPasswordResetBody = z.infer<typeof requestPasswordResetSchema>["body"];
export type SendPasswordResetEmailBody = z.infer<typeof sendPasswordResetEmailSchema>["body"];
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>["body"];
