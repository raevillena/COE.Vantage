/**
 * Grading system v1 — keep in sync with `backend/src/utils/gradingSystemSchema.ts`
 * (categories, optional passingGrade + gradeEquivalence; weights sum to 100 per level).
 */

export type GradingComponentV1 = {
  id?: string;
  name: string;
  weight: number;
  gradeKeys: string[];
};

export type GradingCategoryV1 = {
  id?: string;
  name: string;
  weight: number;
  components: GradingComponentV1[];
};

export type GradeEquivalenceRowV1 = {
  id?: string;
  minPercent: number;
  maxPercent: number;
  /** Numeric equivalent (e.g. MMSU) or letter grade; stored as string in API JSON. */
  letter: string;
  /** MMSU-style outcome shown in UI; stored as `remarks` in API JSON. */
  remarks?: string;
};

/** Remark / outcome column for MMSU-style equivalence rows (maps to `remarks` in persisted JSON). */
export const GRADE_EQUIVALENCE_REMARK_OPTIONS = ["PASSED", "CND", "FAILED"] as const;
export type GradeEquivalenceRemarkOption = (typeof GRADE_EQUIVALENCE_REMARK_OPTIONS)[number];

export function normalizeEquivalenceRemark(remarks: string | undefined): GradeEquivalenceRemarkOption {
  const t = (remarks ?? "").trim().toUpperCase();
  if (t === "CND" || t === "FAILED") return t;
  return "PASSED";
}

export type GradingSystemV1 = {
  categories: GradingCategoryV1[];
  /** How a component's columns combine: add the points (default) or average each column's score/max. */
  componentMethod?: "points" | "average";
  /** Minimum final % (0–100) to mark passed in computed output. */
  passingGrade?: number;
  /** Inclusive ranges; first match wins — avoid overlaps. */
  gradeEquivalence?: GradeEquivalenceRowV1[];
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Typical PH-style table on a 0–100 final scale (adjust to your handbook). */
export function defaultGradeEquivalencePh(): GradeEquivalenceRowV1[] {
  return [
    { id: newId(), minPercent: 90, maxPercent: 100, letter: "A", remarks: "Excellent" },
    { id: newId(), minPercent: 85, maxPercent: 89.99, letter: "B+", remarks: "Very good" },
    { id: newId(), minPercent: 80, maxPercent: 84.99, letter: "B", remarks: "Good" },
    { id: newId(), minPercent: 75, maxPercent: 79.99, letter: "C", remarks: "Satisfactory" },
    { id: newId(), minPercent: 0, maxPercent: 74.99, letter: "F", remarks: "Failed" },
  ];
}

/**
 * The MMSU portal's own rule (its gradesheet page): 1.00 to 3.00 is Passed, 4.00 is Conditional, 5.00 is Failed
 * (INC and DRP are not computed grades). 3.00 is the lowest passing grade and its band below starts at 50%, so a final
 * of 50% or more passes.
 */
export const DEFAULT_PASSING_PERCENT = 50;

/** Default MMSU-style numeric equivalent bands on final % (0–100). Outcome in `remarks` follows the portal: PASSED up to 3, CND for 4, FAILED for 5. */
export function defaultGradeEquivalenceMmsu(): GradeEquivalenceRowV1[] {
  const p = "PASSED";
  return [
    { id: newId(), minPercent: 97, maxPercent: 100, letter: "1", remarks: p },
    { id: newId(), minPercent: 92, maxPercent: 96.99, letter: "1.25", remarks: p },
    { id: newId(), minPercent: 86, maxPercent: 91.99, letter: "1.5", remarks: p },
    { id: newId(), minPercent: 80, maxPercent: 85.99, letter: "1.75", remarks: p },
    { id: newId(), minPercent: 74, maxPercent: 79.99, letter: "2", remarks: p },
    { id: newId(), minPercent: 68, maxPercent: 73.99, letter: "2.25", remarks: p },
    { id: newId(), minPercent: 62, maxPercent: 67.99, letter: "2.5", remarks: p },
    { id: newId(), minPercent: 56, maxPercent: 61.99, letter: "2.75", remarks: p },
    { id: newId(), minPercent: 50, maxPercent: 55.99, letter: "3", remarks: p },
    { id: newId(), minPercent: 40, maxPercent: 49.99, letter: "4", remarks: "CND" },
    { id: newId(), minPercent: 0, maxPercent: 39.99, letter: "5", remarks: "FAILED" },
  ];
}

/**
 * The default weights: "Major Exams" (Midterms 15% + Finals 15%, 30% in all) and "Major Outputs" (the other 70%).
 * Each component's weight is its share of the final grade, and a category's weight is the sum of its components.
 */
export function defaultGradingSystemTemplate(): GradingSystemV1 {
  return {
    categories: [
      {
        id: newId(),
        name: "Major Exams",
        weight: 30,
        components: [
          { id: newId(), name: "Midterms", weight: 15, gradeKeys: ["Midterms"] },
          { id: newId(), name: "Finals", weight: 15, gradeKeys: ["Finals"] },
        ],
      },
      {
        id: newId(),
        name: "Major Outputs",
        weight: 70,
        components: [{ id: newId(), name: "Major Outputs", weight: 70, gradeKeys: ["Major Outputs"] }],
      },
    ],
    passingGrade: DEFAULT_PASSING_PERCENT,
    gradeEquivalence: defaultGradeEquivalenceMmsu(),
  };
}

function normalizeEquivalenceRows(raw: unknown): GradeEquivalenceRowV1[] {
  if (!Array.isArray(raw)) return [];
  const out: GradeEquivalenceRowV1[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as { id?: unknown; minPercent?: unknown; maxPercent?: unknown; letter?: unknown; remarks?: unknown };
    let letter = "";
    if (typeof r.letter === "number" && Number.isFinite(r.letter)) {
      letter = String(r.letter);
    } else if (typeof r.letter === "string") {
      letter = r.letter.trim();
    }
    const minPercent = Number(r.minPercent);
    const maxPercent = Number(r.maxPercent);
    if (!letter || !Number.isFinite(minPercent) || !Number.isFinite(maxPercent)) continue;
    const equiv: GradeEquivalenceRowV1 = {
      id: typeof r.id === "string" && r.id ? r.id : newId(),
      minPercent,
      maxPercent,
      letter,
    };
    if (typeof r.remarks === "string" && r.remarks.trim()) equiv.remarks = r.remarks.trim();
    out.push(equiv);
  }
  return out;
}

/** Accept object or a JSON string (some clients/ORM paths stringify `Json` fields). */
export function parseGradingSystemMaybeJson(raw: unknown): unknown {
  if (raw == null) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  return raw;
}

/** Best-effort parse from API JSON so the form always has something editable. */
export function normalizeGradingSystemFromUnknown(raw: unknown): GradingSystemV1 {
  const parsed = parseGradingSystemMaybeJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { categories: [] };
  }
  const root = parsed as { categories?: unknown; passingGrade?: unknown; gradeEquivalence?: unknown; componentMethod?: unknown };

  const categories = Array.isArray(root.categories)
    ? root.categories.map((cat, ci) => {
        const c = cat as { id?: unknown; name?: unknown; weight?: unknown; components?: unknown };
        const rawComponents = Array.isArray(c.components) ? c.components : [];
        return {
          id: typeof c.id === "string" && c.id ? c.id : newId(),
          name: typeof c.name === "string" && c.name.trim() ? c.name.trim() : `Category ${ci + 1}`,
          weight: Number.isFinite(Number(c.weight)) ? Number(c.weight) : 0,
          components: rawComponents.map((comp, xi) => {
            const p = comp as { id?: unknown; name?: unknown; weight?: unknown; gradeKeys?: unknown };
            const keys = Array.isArray(p.gradeKeys)
              ? p.gradeKeys.filter((k): k is string => typeof k === "string" && k.trim().length > 0).map((k) => k.trim())
              : [];
            return {
              id: typeof p.id === "string" && p.id ? p.id : newId(),
              name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : `Component ${xi + 1}`,
              weight: Number.isFinite(Number(p.weight)) ? Number(p.weight) : 0,
              gradeKeys: keys,
            };
          }),
        };
      })
    : [];

  let passingGrade: number | undefined;
  if (root.passingGrade !== undefined && Number.isFinite(Number(root.passingGrade))) {
    const pg = Number(root.passingGrade);
    if (pg >= 0 && pg <= 100) passingGrade = pg;
  }

  const eq = normalizeEquivalenceRows(root.gradeEquivalence);
  const out: GradingSystemV1 = { categories };
  if (root.componentMethod === "average" || root.componentMethod === "points") out.componentMethod = root.componentMethod;
  if (passingGrade !== undefined) out.passingGrade = passingGrade;
  if (eq.length > 0) out.gradeEquivalence = eq;
  return out;
}

function validateEquivalenceOverlap(rows: GradeEquivalenceRowV1[]): { ok: true } | { ok: false; message: string } {
  for (const r of rows) {
    if (r.minPercent > r.maxPercent) {
      return { ok: false, message: `Equivalence row "${r.letter}": min % must be ≤ max %.` };
    }
  }
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      const overlap = !(a.maxPercent < b.minPercent || a.minPercent > b.maxPercent);
      if (overlap) {
        return { ok: false, message: `Grade equivalence ranges overlap ("${a.letter}" vs "${b.letter}").` };
      }
    }
  }
  return { ok: true };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * A category's weight is the sum of its components' weights, so each component weight is its share of the FINAL grade
 * (for example 20 + 30 + 50 across a quiz, a project and an exam). The category total is worked out, never typed.
 * The stored shape and the grade maths are unchanged: a category's weight times a component's share of the category is
 * exactly the component weight when the category weight is the sum of its components.
 */
export function deriveCategoryWeights(categories: GradingCategoryV1[]): GradingCategoryV1[] {
  return categories.map((cat) => ({ ...cat, weight: round4(cat.components.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0)) }));
}

/**
 * Settings saved before this change had a free category weight with component weights as shares inside the category.
 * Opening them converts the component weights to a share of the final grade (category weight x share), which gives every
 * student the same result as before. `converted` says whether anything had to change.
 */
export function toPercentOfFinal(categories: GradingCategoryV1[]): { categories: GradingCategoryV1[]; converted: boolean } {
  let converted = false;
  const next = categories.map((cat) => {
    const sum = cat.components.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0);
    if (sum <= 0 || Math.abs(sum - cat.weight) < 0.0001) return cat;
    converted = true;
    return { ...cat, components: cat.components.map((c) => ({ ...c, weight: round4((cat.weight * c.weight) / sum) })) };
  });
  return { categories: deriveCategoryWeights(next), converted };
}

const keyOf = (key: string) => key.trim().toLowerCase();

/**
 * Copies another subject's formula onto this subject's columns. A grade key is matched by name (ignoring case and spaces)
 * against the columns this subject has; a component keeps the keys that match and is SKIPPED when none of its keys do. A
 * category left with no component is skipped too. Weights are copied as they are (as a share of the final grade), so the
 * total can fall short of 100 after skipping: the editor then says so and the teacher adjusts.
 */
export function copyFormulaFrom(
  source: unknown,
  availableKeys: string[]
): { categories: GradingCategoryV1[]; copied: number; skipped: string[] } {
  const own = new Map(availableKeys.map((key) => [keyOf(key), key]));
  const sourceCategories = toPercentOfFinal(normalizeGradingSystemFromUnknown(source).categories).categories;
  const skipped: string[] = [];
  let copied = 0;
  const categories: GradingCategoryV1[] = [];
  for (const cat of sourceCategories) {
    const components: GradingComponentV1[] = [];
    for (const comp of cat.components) {
      const keys = Array.from(new Set(comp.gradeKeys.map((k) => own.get(keyOf(k))).filter((k): k is string => Boolean(k))));
      if (keys.length === 0) {
        skipped.push(`${cat.name} › ${comp.name}`);
        continue;
      }
      copied += 1;
      components.push({ id: newId(), name: comp.name, weight: comp.weight, gradeKeys: keys });
    }
    if (components.length > 0) categories.push({ id: newId(), name: cat.name, weight: 0, components });
  }
  return { categories: deriveCategoryWeights(categories), copied, skipped };
}

/**
 * The default weights, tied to a subject's own columns: each component takes the column of the same name (ignoring case,
 * spaces and a trailing "s", so "Midterm" fits "Midterms"), and has no column picked when nothing fits, which the teacher
 * then chooses. The structure and the weights are always all there.
 */
export function defaultFormulaFor(availableKeys: string[]): GradingCategoryV1[] {
  const loose = (key: string) => key.trim().toLowerCase().replace(/\s+/g, " ").replace(/s$/, "");
  const own = new Map(availableKeys.map((key) => [loose(key), key]));
  return defaultGradingSystemTemplate().categories.map((cat) => ({
    ...cat,
    components: cat.components.map((comp) => ({
      ...comp,
      gradeKeys: Array.from(new Set(comp.gradeKeys.map((k) => own.get(loose(k))).filter((k): k is string => Boolean(k)))),
    })),
  }));
}

/** Categories + weights + components only (for the formula panel save). */
export function validateGradingCategories(categories: GradingCategoryV1[]): { ok: true } | { ok: false; message: string } {
  if (categories.length === 0) return { ok: true };

  const catSum = categories.reduce((s, c) => s + c.weight, 0);
  if (Math.abs(catSum - 100) >= 0.02) {
    return {
      ok: false,
      message: `The component weights of all categories must add up to 100 (currently ${catSum.toFixed(2)}).`,
    };
  }

  for (const cat of categories) {
    if (!cat.name.trim()) return { ok: false, message: "Each category needs a name." };
    if (cat.components.length === 0) {
      return { ok: false, message: `Category "${cat.name}" needs at least one component.` };
    }
    for (const comp of cat.components) {
      if (!Number.isFinite(comp.weight) || comp.weight < 0) {
        return { ok: false, message: `Component weights in "${cat.name}" must be non-negative numbers.` };
      }
    }
    const compSum = cat.components.reduce((s, c) => s + c.weight, 0);
    if (!Number.isFinite(compSum) || compSum <= 0) {
      return {
        ok: false,
        message: `Under category "${cat.name}", the component weights must add up to more than zero.`,
      };
    }
    for (const comp of cat.components) {
      if (!comp.name.trim()) return { ok: false, message: `Each component in "${cat.name}" needs a name.` };
      if (comp.gradeKeys.length === 0) {
        return { ok: false, message: `Component "${comp.name}" needs at least one grade key (column name from records).` };
      }
    }
  }
  return { ok: true };
}

/** Grade equivalence table only (for the equivalence panel save). */
export function validateGradeEquivalenceOnly(rows: GradeEquivalenceRowV1[]): { ok: true } | { ok: false; message: string } {
  for (const r of rows) {
    if (!r.letter.trim()) return { ok: false, message: "Each equivalence row needs a letter or grade label." };
  }
  return validateEquivalenceOverlap(rows);
}

export function validateGradingSystem(value: GradingSystemV1): { ok: true } | { ok: false; message: string } {
  if (value.passingGrade !== undefined) {
    if (!Number.isFinite(value.passingGrade) || value.passingGrade < 0 || value.passingGrade > 100) {
      return { ok: false, message: "Passing grade must be between 0 and 100." };
    }
  }

  const eqOnly = validateGradeEquivalenceOnly(value.gradeEquivalence ?? []);
  if (!eqOnly.ok) return eqOnly;

  return validateGradingCategories(value.categories);
}

export function collectGradeKeys(system: GradingSystemV1): string[] {
  const set = new Set<string>();
  for (const cat of system.categories) {
    for (const comp of cat.components) {
      for (const k of comp.gradeKeys) set.add(k);
    }
  }
  return Array.from(set);
}

export function sumWeights(items: { weight: number }[]): number {
  return items.reduce((s, x) => s + x.weight, 0);
}
