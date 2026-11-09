import type { Prisma } from "@prisma/client";

/**
 * Which subjects of a curriculum a class takes. A class with a specialization takes the common subjects (no
 * specialization tag) plus the ones tagged with its own; a class with no specialization takes every subject, as before
 * specializations existed. Use inside `AND: [...]` so it does not clash with another `OR`.
 */
export function classSubjectFilter(specializationId: string | null | undefined): Prisma.SubjectWhereInput {
  if (!specializationId) return {};
  return { OR: [{ specializations: { none: {} } }, { specializations: { some: { specializationId } } }] };
}

/** The same rule for a subject already loaded with its `specializations` rows. */
export function classTakesSubject(specializationId: string | null | undefined, subject: { specializations: { specializationId: string }[] }): boolean {
  if (!specializationId || subject.specializations.length === 0) return true;
  return subject.specializations.some((row) => row.specializationId === specializationId);
}
