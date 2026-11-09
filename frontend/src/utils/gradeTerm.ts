/** A grade subject's term: an academic year and a semester, either of which may be unset. */
export interface GradeTerm {
  yearId: string | null;
  yearName: string | null;
  semester: number | null;
}

export const SEMESTER_LABEL: Record<number, string> = { 1: "1st Sem", 2: "2nd Sem", 3: "Mid Year" };

/** Where an academic year sits in time: its first year ("2025-2026" → 2025). A name without a year sorts oldest. */
function yearRank(name: string | null): number {
  const match = /\d{4}/.exec(name ?? "");
  return match ? Number(match[0]) : 0;
}

/** Newest term first: later academic year, then later semester. A subject with no year comes last. */
export function compareTermsNewestFirst(a: GradeTerm, b: GradeTerm): number {
  if ((a.yearId === null) !== (b.yearId === null)) return a.yearId === null ? 1 : -1;
  const byYear = yearRank(b.yearName) - yearRank(a.yearName) || (b.yearName ?? "").localeCompare(a.yearName ?? "");
  if (byYear !== 0) return byYear;
  return (b.semester ?? 0) - (a.semester ?? 0);
}

export function termKey(term: GradeTerm): string {
  return `${term.yearId ?? "none"}|${term.semester ?? "unset"}`;
}

/** "2nd Sem · 2025-2026", "2025-2026" when no semester is set, "No term set" when neither. */
export function termLabel(term: GradeTerm): string {
  const semester = term.semester != null ? SEMESTER_LABEL[term.semester] : null;
  if (!term.yearName) return "No term set";
  return semester ? `${semester} · ${term.yearName}` : term.yearName;
}

/** The distinct terms in a list, newest first. */
export function distinctTerms(terms: GradeTerm[]): GradeTerm[] {
  const seen = new Map<string, GradeTerm>();
  for (const term of terms) if (!seen.has(termKey(term))) seen.set(termKey(term), term);
  return Array.from(seen.values()).sort(compareTermsNewestFirst);
}

/** The most recent term that has an academic year, or null when none do. */
export function latestTerm(terms: GradeTerm[]): GradeTerm | null {
  return distinctTerms(terms).find((term) => term.yearId !== null) ?? null;
}
