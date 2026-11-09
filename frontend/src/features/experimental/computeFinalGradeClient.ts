/**
 * Mirrors `computeFinal` in `backend/src/modules/gradeSubjects/gradeSubjectService.ts`.
 * Used only for instant preview in the UI — if you change the backend formula, update here too.
 */
import { applyGradePolicy } from "./gradePolicy";
import { collectGradeKeys, type GradingSystemV1 } from "./gradingSystemModel";

export function computeFinalGradeClient(
  gradingSystem: GradingSystemV1 | null | undefined,
  grades: Record<string, number>,
  maxScores?: Record<string, number> | null,
  columnKeys?: Iterable<string>
): { finalGrade: number; breakdown: unknown[]; missingKeys: string[] } {
  const categories = gradingSystem?.categories ?? [];
  if (categories.length === 0) return { finalGrade: 0, breakdown: [], missingKeys: [] };
  // A blank is not a zero: formula items that are real columns of the subject but have no score make the grade INC.
  // A key that is not a column at all is a settings problem and is ignored here (same rule as the server).
  const columns = columnKeys ? new Set(columnKeys) : null;
  const missingKeys = columns
    ? collectGradeKeys(gradingSystem as GradingSystemV1).filter((key) => columns.has(key) && !(typeof grades[key] === "number" && Number.isFinite(grades[key])))
    : [];

  const breakdown = categories.map((category) => {
    const categoryWeight = Number(category.weight ?? 0);
    const components = category.components ?? [];
    const componentScores = components.map((component) => {
      const weight = Number(component.weight ?? 0);
      const keys = component.gradeKeys ?? [];
      let earned = 0;
      let possible = 0;
      for (const key of keys) {
        const score = Number(grades[key] ?? 0);
        const max = Number(maxScores?.[key] ?? 100);
        earned += score;
        possible += max;
      }
      const ratio = possible > 0 ? earned / possible : 0;
      return { id: component.id, name: component.name, weight, scorePercent: ratio * 100 };
    });
    const compSum = componentScores.reduce((s, c) => s + c.weight, 0);
    const weightedComponentScore =
      compSum > 0
        ? componentScores.reduce((sum, c) => sum + c.scorePercent * (c.weight / compSum), 0)
        : 0;
    return {
      id: category.id,
      name: category.name,
      weight: categoryWeight,
      score: weightedComponentScore,
      components: componentScores,
    };
  });

  const finalGrade = breakdown.reduce(
    (sum, category) => sum + category.score * (Number(category.weight ?? 0) / 100),
    0
  );
  return { finalGrade: Number(finalGrade.toFixed(2)), breakdown, missingKeys };
}

/** Preview including letter / pass — same extras as `buildComputedGradeJson` on the server. */
export function computeFinalGradeWithPolicy(
  gradingSystem: GradingSystemV1 | null | undefined,
  grades: Record<string, number>,
  maxScores?: Record<string, number> | null,
  columnKeys?: Iterable<string>
): {
  finalGrade: number | null;
  breakdown: unknown[];
  missingKeys: string[];
  incomplete: boolean;
  letterGrade: string | null;
  remarks: string | null;
  passed: boolean | null;
  passingGrade: number | null;
} {
  const base = computeFinalGradeClient(gradingSystem, grades, maxScores, columnKeys);
  const policy = applyGradePolicy(base.finalGrade, gradingSystem as unknown as Record<string, unknown> | undefined);
  if (base.missingKeys.length > 0) {
    return { finalGrade: null, breakdown: [], missingKeys: base.missingKeys, incomplete: true, letterGrade: "INC", remarks: "INC", passed: null, passingGrade: policy.passingGrade };
  }
  return { ...base, ...policy, incomplete: false };
}
