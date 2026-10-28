/** A subject's units by component. Older records may only carry units + isLab. */
export interface SubjectUnitFields {
  units: number;
  isLab?: boolean;
  lecUnits?: number;
  labUnits?: number;
}

/** Lecture units (1 hour/week each). */
export function lecUnitsOf(s: SubjectUnitFields): number {
  return s.lecUnits ?? (s.isLab ? 0 : s.units);
}

/** Laboratory units (3 hours/week each). */
export function labUnitsOf(s: SubjectUnitFields): number {
  return s.labUnits ?? (s.isLab ? s.units : 0);
}

/** Weekly hours of blocks to schedule. It is also the faculty load credit: 3 lec + 1 lab = 3 + 3 = 6. */
export function weeklyHours(s: SubjectUnitFields): number {
  return lecUnitsOf(s) + labUnitsOf(s) * 3;
}

/** "3", or "4 (3 lec + 1 lab)" when the subject has both components, or "1 lab" for a laboratory-only subject. */
export function unitsLabel(s: SubjectUnitFields): string {
  const lec = lecUnitsOf(s);
  const lab = labUnitsOf(s);
  if (lec > 0 && lab > 0) return `${lec + lab} (${lec} lec + ${lab} lab)`;
  if (lab > 0) return `${lab} lab`;
  return String(lec);
}

/** Short tag for lists: "Lab" for laboratory-only, "Lec/Lab" for both components, empty for lecture-only. */
export function componentTag(s: SubjectUnitFields): string {
  const lab = labUnitsOf(s);
  if (lab === 0) return "";
  return lecUnitsOf(s) > 0 ? "Lec/Lab" : "Lab";
}
