/**
 * Mirrors `computeFinal` in `backend/src/modules/gradeSubjects/gradeSubjectService.ts`.
 * Used only for instant preview in the UI — if you change the backend formula, update here too.
 */
import { applyGradePolicy } from "./gradePolicy";
import type { GradingSystemV1 } from "./gradingSystemModel";

export function computeFinalGradeClient(
  gradingSystem: GradingSystemV1 | null | undefined,
  grades: Record<string, number>,
  maxScores?: Record<string, number> | null
): { finalGrade: number; breakdown: unknown[] } {
  const categories = gradingSystem?.categories ?? [];
  if (categories.length === 0) return { finalGrade: 0, breakdown: [] };

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
  return { finalGrade: Number(finalGrade.toFixed(2)), breakdown };
}

/** Preview including letter / pass — same extras as `buildComputedGradeJson` on the server. */
export function computeFinalGradeWithPolicy(
  gradingSystem: GradingSystemV1 | null | undefined,
  grades: Record<string, number>,
  maxScores?: Record<string, number> | null
) {
  const base = computeFinalGradeClient(gradingSystem, grades, maxScores);
  const policy = applyGradePolicy(base.finalGrade, gradingSystem as unknown as Record<string, unknown> | undefined);
  return { ...base, ...policy };
}
