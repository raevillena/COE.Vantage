import type { AcademicYear } from "../types/api";

export const SEMESTER_NAME: Record<number, string> = { 1: "1st Sem", 2: "2nd Sem", 3: "Mid Year" };

export interface TermLockInfo {
  semester: number;
  lockedByName: string;
  lockedAt: string;
}

/** The lock on a semester of an academic year, or undefined when it is open for changes. */
export function findTermLock(years: AcademicYear[], academicYearId: string, semester: number): TermLockInfo | undefined {
  return years.find((y) => y.id === academicYearId)?.termLocks?.find((l) => l.semester === semester);
}

export function lockedOn(lock: TermLockInfo): string {
  const d = new Date(lock.lockedAt);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
