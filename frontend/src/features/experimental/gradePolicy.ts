/**
 * Maps computed final grade (0–100) to letter/remarks and pass/fail from subject gradingSystem JSON.
 * Keep in sync with `backend/src/utils/gradePolicy.ts`.
 */
export type GradePolicyResult = {
  letterGrade: string | null;
  remarks: string | null;
  passed: boolean | null;
  passingGrade: number | null;
};

export function applyGradePolicy(
  finalGrade: number,
  gradingSystem: Record<string, unknown> | null | undefined
): GradePolicyResult {
  if (!gradingSystem || typeof gradingSystem !== "object") {
    return { letterGrade: null, remarks: null, passed: null, passingGrade: null };
  }

  const passingRaw = (gradingSystem as { passingGrade?: unknown }).passingGrade;
  const passingNum = Number(passingRaw);
  const passingGrade = Number.isFinite(passingNum) && passingNum >= 0 && passingNum <= 100 ? passingNum : null;

  const rawRows = (gradingSystem as { gradeEquivalence?: unknown }).gradeEquivalence;
  const rows = Array.isArray(rawRows) ? rawRows : [];

  let letterGrade: string | null = null;
  let remarks: string | null = null;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as { minPercent?: unknown; maxPercent?: unknown; letter?: unknown; remarks?: unknown };
    const min = Number(row.minPercent);
    const max = Number(row.maxPercent);
    const letter = typeof row.letter === "string" ? row.letter.trim() : "";
    if (!letter || !Number.isFinite(min) || !Number.isFinite(max)) continue;
    if (finalGrade >= min && finalGrade <= max) {
      letterGrade = letter;
      remarks = typeof row.remarks === "string" && row.remarks.trim() ? row.remarks.trim() : null;
      break;
    }
  }

  const passed = passingGrade === null ? null : finalGrade >= passingGrade;

  return { letterGrade, remarks, passed, passingGrade };
}
