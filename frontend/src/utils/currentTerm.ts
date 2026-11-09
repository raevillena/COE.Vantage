import type { AcademicYear } from "../types/api";

type YearTerm = Pick<AcademicYear, "id" | "isActive" | "currentSemester" | "isCalendar" | "calendarSemester">;

const clamp = (semester: number | undefined) => (semester && semester >= 1 && semester <= 3 ? semester : 1);

/**
 * The SCHEDULING semester: the term the college is scheduling now (set by the admin or college secretary). Every
 * scheduling page (Scheduler, schedules, rooms, reports, dashboard, faculty loads) opens on it. With none set the first
 * listed year opens on the 1st semester.
 */
export function schedulingTerm(years: YearTerm[]): { academicYearId: string; semester: number } | null {
  const active = years.find((y) => y.isActive);
  const year = active ?? years[0];
  if (!year) return null;
  return { academicYearId: year.id, semester: clamp(active?.currentSemester) };
}

/**
 * The CURRENT semester: the term that is running now, which is often not the one being scheduled. Faculty-facing pages
 * and the Grades module open on it. Until it is set the server reports the scheduling term as the current one, so
 * this falls back to the scheduling term for older servers too.
 */
export function calendarTerm(years: YearTerm[]): { academicYearId: string; semester: number } | null {
  const cal = years.find((y) => y.isCalendar);
  if (!cal) return schedulingTerm(years);
  return { academicYearId: cal.id, semester: clamp(cal.calendarSemester) };
}

/** An option label for an academic year: marks the scheduling or the current one, depending on what the page is about. */
export function yearLabel(year: Pick<AcademicYear, "name" | "isActive" | "isCalendar">, kind: "scheduling" | "current"): string {
  if (kind === "current") return year.isCalendar ? `${year.name} (current)` : year.name;
  return year.isActive ? `${year.name} (scheduling)` : year.name;
}
