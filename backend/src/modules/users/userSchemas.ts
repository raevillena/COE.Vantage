import { z } from "zod";
import { Role } from "@prisma/client";

const roleEnum = z.nativeEnum(Role);

export const listUsersQuerySchema = z.object({
  query: z.object({
    role: roleEnum.optional(),
    departmentId: z.string().uuid().optional(),
  }),
});

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
    role: roleEnum,
    departmentId: z.string().uuid().optional().nullable(),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    name: z.string().min(1).optional(),
    role: roleEnum.optional(),
    departmentId: z.string().uuid().optional().nullable(),
  }),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>["query"];
export type CreateUserBody = z.infer<typeof createUserSchema>["body"];
export type UpdateUserBody = z.infer<typeof updateUserSchema>["body"];