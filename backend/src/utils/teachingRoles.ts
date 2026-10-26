import type { Role } from "@prisma/client";

/**
 * Roles that can carry a teaching load: they appear in faculty lists, can be assigned in the scheduler,
 * have a maximum-units setting and deloading, and are counted in faculty workload metrics.
 */
export const TEACHING_ROLES: Role[] = ["FACULTY", "CHAIRMAN", "DEAN", "COLLEGE_SECRETARY"];

export function isTeachingRole(role: string): boolean {
  return (TEACHING_ROLES as string[]).includes(role);
}
