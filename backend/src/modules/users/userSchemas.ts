import { z } from "zod";
import { Role } from "@prisma/client";

const roleEnum = z.nativeEnum(Role);

/**
 * Email validation that allows Unicode in the local part (e.g. jpeña@mmsu.edu.ph for names with ñ).
 * Zod's default .email() is ASCII-only and would reject ñ.
 */
const emailWithUnicode = z
  .string()
  .min(1)
  .refine(
    (val) => {
      const at = val.indexOf("@");
      if (at < 1 || at >= val.length - 1) return false;
      const local = val.slice(0, at);
      const domain = val.slice(at + 1);
      // Local: Unicode letters (e.g. ñ), numbers, and common separators
      if (!/^[\p{L}\p{N}._'+-]+$/u.test(local) || local.length > 64) return false;
      // Domain: at least one dot, TLD 2+ chars (e.g. mmsu.edu.ph)
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return false;
      return true;
    },
    { message: "Invalid email address" }
  );

export const listUsersQuerySchema = z.object({
  query: z.object({
    role: roleEnum.optional(),
    departmentId: z.string().uuid().optional(),
  }),
});

export const createUserSchema = z.object({
  body: z.object({
    email: emailWithUnicode,
    password: z.string().min(8),
    name: z.string().min(1),
    role: roleEnum,
    departmentId: z.string().uuid().optional().nullable(),
    status: z.string().max(100).optional().nullable(),
    maxUnits: z.number().int().min(0).optional().nullable(), // 0 = faculty cannot receive any load
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    email: emailWithUnicode.optional(),
    name: z.string().min(1).optional(),
    role: roleEnum.optional(),
    departmentId: z.string().uuid().optional().nullable(),
    status: z.string().max(100).optional().nullable(),
    maxUnits: z.number().int().min(0).optional().nullable(), // 0 = faculty cannot receive any load
  }),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>["query"];
export type CreateUserBody = z.infer<typeof createUserSchema>["body"];
export type UpdateUserBody = z.infer<typeof updateUserSchema>["body"];