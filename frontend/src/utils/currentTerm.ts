import type { AcademicYear } from "../types/api";

/**
 * The term the filters open on: the active academic year (set by the admin or college secretary) and its
 * current semester. With no active year the first listed year opens on the 1st semester.
 */
export function currentTerm(years: Pick<AcademicYear, "id" | "isActive" | "currentSemester">[]): { academicYearId: string; semester: number } | null {
  const active = years.find((y) => y.isActive);
  const year = active ?? years[0];
  if (!year) return null;
  const semester = active ? active.currentSemester ?? 1 : 1;
  return { academicYearId: year.id, semester: semester >= 1 && semester <= 3 ? semester : 1 };
}
