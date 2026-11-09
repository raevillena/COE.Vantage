/**
 * Does a class take a subject? A class with a specialization takes the common subjects (no specialization tag) and the
 * ones tagged with its own; a class with none takes every subject. Same rule as the server.
 */
export function classTakesSubject(specializationId: string | null | undefined, subject: { specializationIds?: string[] }): boolean {
  const tags = subject.specializationIds ?? [];
  if (!specializationId || tags.length === 0) return true;
  return tags.includes(specializationId);
}
