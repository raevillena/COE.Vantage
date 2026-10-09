import { z } from "zod";

const gradeEquivalenceRowSchema = z
  .object({
    id: z.string().optional(),
    minPercent: z.number().min(0).max(100),
    maxPercent: z.number().min(0).max(100),
    /** Numeric equivalent (e.g. MMSU 1–5) or letter grade; numbers in JSON are coerced to string. */
    letter: z.preprocess(
      (val) => (typeof val === "number" && Number.isFinite(val) ? String(val) : val),
      z.string().min(1, "Equivalent / letter label is required")
    ),
    remarks: z.string().optional(),
  })
  .refine((r) => r.minPercent <= r.maxPercent, {
    message: "Each row needs min ≤ max (percent).",
    path: ["minPercent"],
  });

/** Object shape before cross-field rules — used as base for full schema and for PATCH `.partial()`. */
const gradingSystemV1ObjectSchema = z
  .object({
    categories: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().min(1, "Each category needs a name"),
          weight: z.number().finite(),
          components: z.array(
            z.object({
              id: z.string().optional(),
              name: z.string().min(1, "Each component needs a name"),
              weight: z.number().finite().min(0, "Component weight cannot be negative"),
              gradeKeys: z.array(z.string().min(1)).min(1, "Each component needs at least one grade key"),
            })
          ),
        })
      )
      .default([]),
    /** Minimum final grade (0–100 inclusive) to mark `passed: true` in computed output. */
    passingGrade: z.number().min(0).max(100).optional(),
    /** Inclusive percent ranges → letter; first matching row wins (define non-overlapping ranges). */
    gradeEquivalence: z.array(gradeEquivalenceRowSchema).optional(),
  })
  .passthrough();

/**
 * Allowed keys in PATCH `gradingSystem` — merge shallowly into stored JSON; merged value is then validated with `gradingSystemV1Schema`.
 */
export const gradingSystemV1PatchSchema = gradingSystemV1ObjectSchema.partial();

export type GradingSystemV1Patch = z.infer<typeof gradingSystemV1PatchSchema>;

/** Shape used by `computeFinal` in gradeSubjectService — validated on create/update subject. */
export const gradingSystemV1Schema = gradingSystemV1ObjectSchema.superRefine((data, ctx) => {
    if (data.categories.length === 0) return;
    const catSum = data.categories.reduce((s, c) => s + c.weight, 0);
    if (Math.abs(catSum - 100) >= 0.02) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Category weights must sum to 100 (currently ${Number(catSum.toFixed(2))}).`,
        path: ["categories"],
      });
    }
    data.categories.forEach((cat, i) => {
      if (cat.components.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Category "${cat.name}" needs at least one component.`,
          path: ["categories", i, "components"],
        });
        return;
      }
      const compSum = cat.components.reduce((s, c) => s + c.weight, 0);
      if (!Number.isFinite(compSum) || compSum <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Under "${cat.name}", component weights must sum to a positive number (they are relative shares inside the category; compute scales them to 100%).`,
          path: ["categories", i, "components"],
        });
      }
    });

    const eq = data.gradeEquivalence ?? [];
    for (let i = 0; i < eq.length; i += 1) {
      for (let j = i + 1; j < eq.length; j += 1) {
        const a = eq[i];
        const b = eq[j];
        const overlap = !(a.maxPercent < b.minPercent || a.minPercent > b.maxPercent);
        if (overlap) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Grade equivalence ranges overlap (${a.letter} vs ${b.letter}). Use non-overlapping min/max.`,
            path: ["gradeEquivalence"],
          });
          return;
        }
      }
    }
  });

export type GradingSystemV1 = z.infer<typeof gradingSystemV1Schema>;

/** Shallow-merge a PATCH chunk into existing stored grading JSON (top-level keys only). */
export function mergeGradingSystemJson(existing: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const base =
    existing !== null &&
    existing !== undefined &&
    typeof existing === "object" &&
    !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch };
}
