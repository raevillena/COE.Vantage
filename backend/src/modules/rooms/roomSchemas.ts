import { z } from "zod";

export const createRoomSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1),
    capacity: z.number().int().min(1),
    hasComputer: z.boolean().optional().default(false),
    isLab: z.boolean().optional().default(false),
    hasAC: z.boolean().optional().default(false),
    departmentId: z.string().uuid(),
  }),
});

export const updateRoomSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).optional(),
    capacity: z.number().int().min(1).optional(),
    hasComputer: z.boolean().optional(),
    isLab: z.boolean().optional(),
    hasAC: z.boolean().optional(),
    departmentId: z.string().uuid().optional(),
  }),
});

export const roomAvailabilityQuerySchema = z.object({
  query: z.object({
    academicYearId: z.string().uuid(),
    semester: z.coerce.number().int().min(1).max(3),
  }),
});

export const transferRoomSchema = z.object({
  body: z.object({ departmentId: z.string().uuid() }),
});
export type TransferRoomBody = z.infer<typeof transferRoomSchema>["body"];

export const setRoomAvailabilitySchema = z.object({
  body: z.object({
    academicYearId: z.string().uuid(),
    semester: z.number().int().min(1).max(3),
    isOpen: z.boolean(),
  }),
});

export type RoomAvailabilityQuery = z.infer<typeof roomAvailabilityQuerySchema>["query"];
export type SetRoomAvailabilityBody = z.infer<typeof setRoomAvailabilitySchema>["body"];

export const listRoomsQuerySchema = z.object({
  query: z.object({
    departmentId: z.string().uuid().optional(),
    isLab: z.enum(["true", "false"]).optional(),
    minCapacity: z.string().optional(), // number as query string
  }),
});

export type CreateRoomBody = z.infer<typeof createRoomSchema>["body"];
export type UpdateRoomBody = z.infer<typeof updateRoomSchema>["body"];
export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>["query"];