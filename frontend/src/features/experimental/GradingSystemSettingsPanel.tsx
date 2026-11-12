import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { isAxiosError } from "axios";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import { computeFinalGradeWithPolicy } from "./computeFinalGradeClient";
import {
  collectGradeKeys,
  copyFormulaFrom,
  defaultFormulaFor,
  deriveCategoryWeights,
  DEFAULT_PASSING_PERCENT,
  defaultGradeEquivalenceMmsu,
  defaultGradeEquivalencePh,
  defaultGradingSystemTemplate,
  GRADE_EQUIVALENCE_REMARK_OPTIONS,
  normalizeEquivalenceRemark,
  normalizeGradingSystemFromUnknown,
  sumWeights,
  validateGradeEquivalenceOnly,
  validateGradingCategories,
  validateGradingSystem,
  type GradeEquivalenceRowV1,
  type GradeEquivalenceRemarkOption,
  type GradingCategoryV1,
  type GradingComponentV1,
  type GradingSystemV1,
  toPercentOfFinal,
} from "./gradingSystemModel";

type GradeRecord = {
  id: string;
  studentName: string;
  studentNumber: string;
  grades: Record<string, number>;
  maxScores?: Record<string, number> | null;
};

/** PATCH `/grade-subjects/:id` response shape (merge into list state so saves apply before the next full fetch). */
export type GradeSubjectPatchResponse = Record<string, unknown> & {
  id: string;
  gradingSystem?: Record<string, unknown> | null;
  studentComputeEnabled?: boolean;
};

type Props = {
  subjectId: string;
  initialGradingSystem: Record<string, unknown> | null | undefined;
  /** Stable fingerprint from `JSON.stringify(initialGradingSystem)` so effects detect server updates without stale object refs. */
  gradingSystemSnapshot: string;
  initialStudentComputeEnabled: boolean;
  initialPublicViewEnabled?: boolean;
  records: GradeRecord[];
  /** Other subjects whose formula can be copied here. */
  copySources?: { id: string; name: string; code?: string | null; gradingSystem?: Record<string, unknown> | null }[];
  saving: boolean;
  /** When true, no outer card or duplicate page title (e.g. inside a dialog that already has a title). */
  embedInDialog?: boolean;
  /** When false, skip syncing form from props (dialog closed); avoids stale state when Radix keeps the tree mounted. */
  settingsOpen?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onSaved?: (updatedSubject?: GradeSubjectPatchResponse) => void | Promise<void>;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Browser tooltip on the category/component section title (replaces long inline copy). */
const CATEGORY_WEIGHTS_TOOLTIP =
  "Each component weight is its share of the final grade, and all components together should add up to 100. A category total is the sum of its components, so it is worked out for you. Example: quizzes 20 + projects 20 + exams 60 gives a Class work category of 40 and an Exams category of 60.";

const PASSING_SAVE_FOOTNOTE =
  "Updates passing grade and whether students can compute their grade from this panel. Formula and equivalence stay as last saved on the server.";
const EQUIVALENCE_SAVE_FOOTNOTE =
  "Updates the grade equivalence table only. Passing, student access, and formula stay as last saved.";
const FORMULA_SAVE_FOOTNOTE =
  "Updates categories and weights only. Passing grade, student access, and equivalence stay as last saved.";

/** After advanced JSON apply, PATCH all top-level grading keys so the editor stays consistent with the server. */
function buildGradingPatchFromNormalized(n: GradingSystemV1): Record<string, unknown> {
  return {
    categories: n.categories,
    gradeEquivalence: n.gradeEquivalence ?? [],
    ...(n.passingGrade !== undefined ? { passingGrade: n.passingGrade } : {}),
  };
}

function PanelSaveRow({
  saving,
  onSave,
  label,
  footnote,
}: {
  saving: boolean;
  onSave: () => void;
  label: string;
  footnote: string;
}) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        type="button"
        disabled={saving}
        onClick={onSave}
        className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {label}
      </button>
      <p className="mt-1.5 text-[11px] leading-snug text-foreground-muted">{footnote}</p>
    </div>
  );
}

function CollapsibleCard({
  open,
  onToggle,
  title,
  summaryClosed,
  summaryOpen,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  summaryClosed?: ReactNode;
  summaryOpen?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border-2 border-border-strong bg-surface text-foreground shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 rounded-t-lg text-left hover:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1 p-4 pb-3">
          {title}
          {open ? summaryOpen : summaryClosed}
        </div>
        <ChevronDown
          className={`mr-2 mt-0.5 h-5 w-5 shrink-0 text-foreground-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && <div className="border-t border-border px-4 pb-4 pt-2">{children}</div>}
    </div>
  );
}

/**
 * Which score columns count in a component. The choices are the columns the subject's records already have, so a
 * key can no longer be mistyped. A key the formula still names but no record has is kept visible (flagged) until removed.
 */
function GradeKeyPicker({
  available,
  selected,
  usedElsewhere,
  onChange,
}: {
  available: string[];
  selected: string[];
  /** Key → "Category › Component" for keys another component already counts. */
  usedElsewhere: Record<string, string>;
  onChange: (keys: string[]) => void;
}) {
  const labelId = useId();
  const missing = selected.filter((key) => !available.includes(key));
  const duplicated = selected.filter((key) => usedElsewhere[key]);

  const set = (next: string[]) => {
    // Keep the picks in column order, with keys that no longer exist (if any) after them.
    onChange([...available.filter((key) => next.includes(key)), ...next.filter((key) => !available.includes(key))]);
  };
  const toggle = (key: string, on: boolean) => set(on ? [...selected, key] : selected.filter((k) => k !== key));

  return (
    <div role="group" aria-labelledby={labelId} className="w-full basis-full">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span id={labelId} className="text-xs font-medium text-foreground">
          Grade keys{" "}
          <span className="font-normal text-foreground-muted">
            — pick the score columns that count here ({selected.filter((k) => available.includes(k)).length} of {available.length})
          </span>
        </span>
        {available.length > 0 && (
          <span className="flex gap-3 text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => set([...available, ...missing])}>
              Select all
            </button>
            <button type="button" className="text-primary hover:underline" onClick={() => set([])}>
              Clear
            </button>
          </span>
        )}
      </div>
      {available.length === 0 && (
        <p className="rounded border border-dashed border-border-strong px-2 py-1.5 text-xs text-foreground-muted">
          This subject has no score columns yet. Add a record or import data first, then pick the columns that count here.
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {available.map((key) => {
          const on = selected.includes(key);
          const other = usedElsewhere[key];
          return (
            <label key={key} className="relative" title={other ? `Also counted in ${other}` : undefined}>
              <input type="checkbox" className="peer sr-only" checked={on} onChange={(e) => toggle(key, e.target.checked)} />
              <span
                className={`inline-flex cursor-pointer select-none items-center gap-1 rounded-full border px-2.5 py-1 text-xs peer-focus-visible:ring-2 peer-focus-visible:ring-focus-ring peer-focus-visible:ring-offset-1 ${
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface text-foreground hover:bg-surface-hover"
                } ${other ? "border-dashed" : ""}`}
              >
                {on && <Check className="h-3 w-3" aria-hidden />}
                {key}
              </span>
            </label>
          );
        })}
        {missing.map((key) => (
          <button
            key={`missing-${key}`}
            type="button"
            title="No record has this column. Click to remove it from the formula."
            onClick={() => toggle(key, false)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-warning bg-warning-muted px-2.5 py-1 text-xs text-warning hover:opacity-80"
          >
            {key} · no such column ✕
          </button>
        ))}
      </div>
      {available.some((key) => usedElsewhere[key]) && (
        <p className="mt-1 text-xs text-foreground-muted">Dashed columns are already counted in another component.</p>
      )}
      {duplicated.length > 0 && (
        <p className="mt-1 text-xs text-warning">
          Also counted in another component: {duplicated.map((key) => `${key} (${usedElsewhere[key]})`).join(", ")}.
        </p>
      )}
    </div>
  );
}

function emptyCategory(gradeKeys: string[]): GradingCategoryV1 {
  return {
    id: newId(),
    name: "New category",
    weight: 0,
    components: [
      {
        id: newId(),
        name: "Component A",
        weight: 0,
        gradeKeys,
      },
    ],
  };
}

export function GradingSystemSettingsPanel({
  subjectId,
  initialGradingSystem,
  gradingSystemSnapshot,
  initialStudentComputeEnabled,
  initialPublicViewEnabled = false,
  records,
  copySources = [],
  saving,
  embedInDialog = false,
  settingsOpen = true,
  onBusyChange,
  onSaved,
}: Props) {
  const [categories, setCategories] = useState<GradingCategoryV1[]>(
    () => toPercentOfFinal(normalizeGradingSystemFromUnknown(initialGradingSystem).categories).categories
  );
  /** Set as soon as the teacher shapes the formula, so the default weights are never put back over their work. */
  const [formulaTouched, setFormulaTouched] = useState(false);
  /** True while the editor shows the default weights nobody saved yet. */
  const [startedFromDefault, setStartedFromDefault] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
  const [copyNote, setCopyNote] = useState<{ ok: boolean; text: string } | null>(null);
  /** True when older settings were converted to "% of final" on opening (results unchanged). */
  const [weightsConverted, setWeightsConverted] = useState(() => toPercentOfFinal(normalizeGradingSystemFromUnknown(initialGradingSystem).categories).converted);
  /** Applies loaded categories: component weights become a share of the final and category totals are derived. */
  const adoptCategories = (cats: GradingCategoryV1[]) => {
    const adopted = toPercentOfFinal(cats);
    setCategories(adopted.categories);
    setWeightsConverted(adopted.converted);
  };
  const [passingGradeInput, setPassingGradeInput] = useState(() => {
    const n = normalizeGradingSystemFromUnknown(initialGradingSystem);
    return n.passingGrade !== undefined ? String(n.passingGrade) : String(DEFAULT_PASSING_PERCENT);
  });
  const [gradeEquivalence, setGradeEquivalence] = useState<GradeEquivalenceRowV1[]>(() => {
    const n = normalizeGradingSystemFromUnknown(initialGradingSystem);
    return n.gradeEquivalence ?? [];
  });
  const [studentComputeEnabled, setStudentComputeEnabled] = useState(initialStudentComputeEnabled);
  const [publicViewEnabled, setPublicViewEnabled] = useState(initialPublicViewEnabled);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedJson, setAdvancedJson] = useState("");
  const [localSettingsError, setLocalSettingsError] = useState<string | null>(null);
  const [previewRecordId, setPreviewRecordId] = useState<string>("");
  /** Collapse the grade equivalence card to save vertical space in the dialog. */
  const [equivalenceOpen, setEquivalenceOpen] = useState(true);
  const [passingSectionOpen, setPassingSectionOpen] = useState(true);
  const [formulaSectionOpen, setFormulaSectionOpen] = useState(true);
  const [previewSectionOpen, setPreviewSectionOpen] = useState(false);

  // Re-apply server grading JSON when the dialog is open. Parse `gradingSystemSnapshot` (not `initialGradingSystem` alone) so
  // we never apply a stale object ref after `gradingSystemSnapshot` updates — that mismatch dropped gradeEquivalence on save/reopen.
  useEffect(() => {
    if (embedInDialog && !settingsOpen) return;

    let raw: unknown;
    try {
      raw = JSON.parse(gradingSystemSnapshot) as unknown;
    } catch {
      raw = initialGradingSystem;
    }

    const n = normalizeGradingSystemFromUnknown(raw);
    adoptCategories(n.categories);
    setPassingGradeInput(n.passingGrade !== undefined ? String(n.passingGrade) : String(DEFAULT_PASSING_PERCENT));
    setGradeEquivalence(n.gradeEquivalence ?? []);
    setStudentComputeEnabled(initialStudentComputeEnabled);
    setPublicViewEnabled(initialPublicViewEnabled);
    setLocalSettingsError(null);
  }, [embedInDialog, settingsOpen, subjectId, gradingSystemSnapshot, initialStudentComputeEnabled, initialPublicViewEnabled]);

  const systemPayload: GradingSystemV1 = useMemo(() => {
    const out: GradingSystemV1 = { categories };
    const t = passingGradeInput.trim();
    if (t !== "") {
      const pg = Number(t);
      if (Number.isFinite(pg)) out.passingGrade = pg;
    }
    if (gradeEquivalence.length > 0) out.gradeEquivalence = gradeEquivalence;
    return out;
  }, [categories, passingGradeInput, gradeEquivalence]);

  const categoryWeightSum = sumWeights(categories);
  const categoryWeightOk = categories.length === 0 || Math.abs(categoryWeightSum - 100) < 0.02;

  const expectedKeys = useMemo(() => collectGradeKeys(systemPayload), [systemPayload]);

  /** The subject's score columns: every item any record has a score or a maximum for (a column exists once it has a maximum). */
  const availableKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const record of records) {
      for (const key of Object.keys(record.grades ?? {})) keys.add(key);
      for (const key of Object.keys(record.maxScores ?? {})) keys.add(key);
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [records]);

  // A subject with no saved formula starts from the default weights (Major Exams 15 + 15, Major Outputs 70), tied to its columns.
  const serverHasFormula = useMemo(() => {
    try {
      return normalizeGradingSystemFromUnknown(JSON.parse(gradingSystemSnapshot) as unknown).categories.length > 0;
    } catch {
      return false;
    }
  }, [gradingSystemSnapshot]);
  const availableKeysSignature = availableKeys.join("|");
  useEffect(() => {
    if (embedInDialog && !settingsOpen) return;
    if (serverHasFormula || formulaTouched) return;
    setCategories(defaultFormulaFor(availableKeys));
    setWeightsConverted(false);
    setStartedFromDefault(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedInDialog, settingsOpen, serverHasFormula, formulaTouched, availableKeysSignature]);
  // closing the dialog drops unsaved shaping, so the next opening starts from what is saved (or the defaults again)
  useEffect(() => {
    if (embedInDialog && !settingsOpen) {
      setFormulaTouched(false);
      setStartedFromDefault(false);
    }
  }, [embedInDialog, settingsOpen]);

  /** A new component starts on the first column no component counts yet (none when they are all taken). */
  const unusedKeys = (): string[] => {
    const used = new Set(categories.flatMap((c) => c.components.flatMap((x) => x.gradeKeys)));
    const free = availableKeys.find((key) => !used.has(key));
    return free ? [free] : [];
  };

  /** Keys another component already counts, for the picker's duplicate hint. */
  const usedByOthers = (catIndex: number, compIndex: number): Record<string, string> => {
    const out: Record<string, string> = {};
    categories.forEach((c, ci) =>
      c.components.forEach((x, xi) => {
        if (ci === catIndex && xi === compIndex) return;
        for (const key of x.gradeKeys) out[key] ??= `${c.name} › ${x.name}`;
      })
    );
    return out;
  };

  const previewRecord = useMemo(
    () => records.find((r) => r.id === previewRecordId) ?? records[0] ?? null,
    [records, previewRecordId]
  );

  const preview = useMemo(() => {
    if (!previewRecord) return null;
    return computeFinalGradeWithPolicy(systemPayload, previewRecord.grades, previewRecord.maxScores ?? null, availableKeys);
  }, [previewRecord, systemPayload, availableKeys]);

  const openAdvanced = () => {
    setAdvancedJson(JSON.stringify(systemPayload, null, 2));
    setAdvancedOpen(true);
    setLocalSettingsError(null);
  };

  const applyAdvancedJson = async () => {
    try {
      const parsed = JSON.parse(advancedJson) as unknown;
      const normalized = normalizeGradingSystemFromUnknown(parsed);
      const v = validateGradingSystem(normalized);
      if (!v.ok) {
        setLocalSettingsError(v.message);
        return;
      }
      setLocalSettingsError(null);
      onBusyChange?.(true);
      try {
        const { data } = await apiClient.patch<GradeSubjectPatchResponse>(`/grade-subjects/${subjectId}`, {
          gradingSystem: buildGradingPatchFromNormalized(normalized),
        });
        adoptCategories(normalized.categories);
        setPassingGradeInput(normalized.passingGrade !== undefined ? String(normalized.passingGrade) : String(DEFAULT_PASSING_PERCENT));
        setGradeEquivalence(normalized.gradeEquivalence ?? []);
        setAdvancedOpen(false);
        await onSaved?.(data);
      } catch (err) {
        const message = isAxiosError(err)
          ? String(err.response?.data?.message ?? err.message)
          : "Could not save grading settings.";
        setLocalSettingsError(message);
      } finally {
        onBusyChange?.(false);
      }
    } catch {
      setLocalSettingsError("Invalid JSON.");
    }
  };

  const patchSubject = async (body: Record<string, unknown>) => {
    setLocalSettingsError(null);
    onBusyChange?.(true);
    try {
      const { data } = await apiClient.patch<GradeSubjectPatchResponse>(`/grade-subjects/${subjectId}`, body);
      await onSaved?.(data);
    } catch (err) {
      const message = isAxiosError(err)
        ? String(err.response?.data?.message ?? err.message)
        : "Could not save grading settings.";
      setLocalSettingsError(message);
    } finally {
      onBusyChange?.(false);
    }
  };

  const persistPassingAndAccess = async () => {
    const t = passingGradeInput.trim();
    if (t !== "") {
      const pg = Number(t);
      if (!Number.isFinite(pg) || pg < 0 || pg > 100) {
        setLocalSettingsError("Passing grade must be between 0 and 100.");
        return;
      }
    }
    const gradingPatch: Record<string, unknown> = {};
    if (t !== "") {
      const pg = Number(t);
      if (Number.isFinite(pg)) gradingPatch.passingGrade = pg;
    }
    await patchSubject({
      ...(Object.keys(gradingPatch).length > 0 ? { gradingSystem: gradingPatch } : {}),
      studentComputeEnabled,
      publicViewEnabled,
    });
  };

  const persistEquivalenceOnly = async () => {
    const v = validateGradeEquivalenceOnly(gradeEquivalence);
    if (!v.ok) {
      setLocalSettingsError(v.message);
      return;
    }
    await patchSubject({ gradingSystem: { gradeEquivalence } });
  };

  const persistFormulaOnly = async () => {
    const v = validateGradingCategories(categories);
    if (!v.ok) {
      setLocalSettingsError(v.message);
      return;
    }
    await patchSubject({ gradingSystem: { categories } });
  };

  const loadTemplate = () => {
    const t = defaultGradingSystemTemplate();
    setCategories(defaultFormulaFor(availableKeys));
    setWeightsConverted(false);
    setFormulaTouched(true);
    setStartedFromDefault(false);
    setPassingGradeInput(t.passingGrade !== undefined ? String(t.passingGrade) : String(DEFAULT_PASSING_PERCENT));
    setGradeEquivalence(t.gradeEquivalence ?? []);
    setLocalSettingsError(null);
  };

  const loadSampleEquivalenceOnly = () => {
    setGradeEquivalence(defaultGradeEquivalencePh());
    setLocalSettingsError(null);
  };

  const resetEquivalenceToMmsuDefault = () => {
    setGradeEquivalence(defaultGradeEquivalenceMmsu());
    setLocalSettingsError(null);
  };

  const clearEquivalenceOverrides = () => {
    setGradeEquivalence([]);
    setLocalSettingsError(null);
  };

  const addEquivalenceRow = () => {
    setGradeEquivalence((prev) => [
      ...prev,
      { id: newId(), minPercent: 0, maxPercent: 100, letter: "3", remarks: "PASSED" },
    ]);
  };

  const removeEquivalenceRow = (index: number) => {
    setGradeEquivalence((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEquivalenceRow = (index: number, patch: Partial<GradeEquivalenceRowV1>) => {
    setGradeEquivalence((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const sortEquivalenceByMin = () => {
    setGradeEquivalence((prev) => [...prev].sort((a, b) => a.minPercent - b.minPercent));
  };

  /** Copies the chosen subject's formula onto this subject's columns; components with no matching column are skipped. Nothing is saved until "Save formula". */
  const copyFormula = () => {
    const source = copySources.find((x) => x.id === copyFrom);
    if (!source) return;
    const result = copyFormulaFrom(source.gradingSystem, availableKeys);
    if (result.categories.length === 0) {
      setCopyNote({ ok: false, text: `Nothing was copied: none of the components of "${source.name}" match a column of this subject${result.skipped.length > 0 ? ` (${result.skipped.join(", ")})` : ""}.` });
      return;
    }
    setCategories(result.categories);
    setWeightsConverted(false);
    setFormulaTouched(true);
    setStartedFromDefault(false);
    setLocalSettingsError(null);
    const total = result.categories.reduce((sum, c) => sum + c.weight, 0);
    setCopyNote({
      ok: true,
      text:
        `Copied ${result.copied} component${result.copied === 1 ? "" : "s"} from "${source.name}".` +
        (result.skipped.length > 0 ? ` Skipped ${result.skipped.length} that match no column here: ${result.skipped.join(", ")}.` : "") +
        (Math.abs(total - 100) >= 0.02 ? ` The weights now add up to ${total.toFixed(2)}: adjust them to reach 100.` : "") +
        " Review, then press Save formula to keep it.",
    });
  };

  /** Every edit goes through here so a category's weight is always the sum of its components. */
  const editCategories = (change: (prev: GradingCategoryV1[]) => GradingCategoryV1[]) => {
    setFormulaTouched(true);
    setStartedFromDefault(false);
    setCategories((prev) => deriveCategoryWeights(change(prev)));
  };

  const addCategory = () => {
    editCategories((prev) => [...prev, emptyCategory(unusedKeys())]);
  };

  const removeCategory = (index: number) => {
    editCategories((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCategory = (index: number, patch: Partial<GradingCategoryV1>) => {
    editCategories((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const addComponent = (catIndex: number) => {
    editCategories((prev) =>
      prev.map((c, i) =>
        i === catIndex
          ? {
              ...c,
              components: [
                ...c.components,
                { id: newId(), name: "New component", weight: 0, gradeKeys: unusedKeys() },
              ],
            }
          : c
      )
    );
  };

  const removeComponent = (catIndex: number, compIndex: number) => {
    editCategories((prev) =>
      prev.map((c, i) =>
        i === catIndex ? { ...c, components: c.components.filter((_, j) => j !== compIndex) } : c
      )
    );
  };

  const updateComponent = (catIndex: number, compIndex: number, patch: Partial<GradingComponentV1>) => {
    editCategories((prev) =>
      prev.map((c, i) => {
        if (i !== catIndex) return c;
        return {
          ...c,
          components: c.components.map((comp, j) => (j === compIndex ? { ...comp, ...patch } : comp)),
        };
      })
    );
  };

  return (
    <div className={embedInDialog ? "space-y-3" : "rounded border border-border bg-surface p-3"}>
      {!embedInDialog && <h3 className="mb-2 text-sm font-semibold text-foreground">Subject grading settings</h3>}

      <CollapsibleCard
        open={passingSectionOpen}
        onToggle={() => setPassingSectionOpen((o) => !o)}
        title={<h3 className="text-base font-semibold tracking-tight text-foreground">Passing grade &amp; student access</h3>}
        summaryClosed={
          <p className="mt-1 text-xs text-foreground-muted">Pass/fail threshold and whether students can compute on the public grade page.</p>
        }
        summaryOpen={
          <p className="mt-1 text-sm text-foreground-muted">
            Minimum final % sets the <code className="text-foreground">passed</code> flag after compute. Leave passing % empty to omit pass/fail.
          </p>
        }
      >
        <label className="mb-2 flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={publicViewEnabled} onChange={(e) => setPublicViewEnabled(e.target.checked)} />
          Let students view this subject on the public grade page
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={studentComputeEnabled}
            onChange={(e) => setStudentComputeEnabled(e.target.checked)}
          />
          Allow students to compute grades in public view
        </label>
        <div className="mt-3 rounded border border-border-strong bg-surface-muted/40 p-3">
          <label className="flex max-w-[12rem] flex-col gap-0.5 text-xs text-foreground-muted">
            Passing %
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              className="rounded border border-border bg-surface px-2 py-1 text-sm text-foreground"
              value={passingGradeInput}
              onChange={(e) => setPassingGradeInput(e.target.value)}
              placeholder={`e.g. ${DEFAULT_PASSING_PERCENT}`}
            />
          </label>
        </div>
        <PanelSaveRow
          saving={saving}
          label="Save passing & access"
          footnote={PASSING_SAVE_FOOTNOTE}
          onSave={() => void persistPassingAndAccess()}
        />
      </CollapsibleCard>

      <CollapsibleCard
        open={equivalenceOpen}
        onToggle={() => setEquivalenceOpen((o) => !o)}
        title={
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <span>Grade equivalence table</span>
            <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground-muted">
              {gradeEquivalence.length} range{gradeEquivalence.length === 1 ? "" : "s"}
            </span>
          </h3>
        }
        summaryClosed={
          <p className="mt-1 text-xs text-foreground-muted">
            MMSU-style bands: min/max %, numeric equivalent, and PASSED / CND / FAILED per row.
          </p>
        }
        summaryOpen={
          <p className="mt-1 text-sm text-foreground-muted">
            Subject-specific table for letter/equivalent and remarks after compute. Leave empty to skip policy mapping.
          </p>
        }
      >
        <div>
          <p className="text-xs text-foreground-muted">
            Students use this table when they compute grades on the public page (if enabled).
          </p>
          <p className="mt-2 text-xs text-foreground-muted">
            Inclusive min/max on final % (0–100). First matching row wins—avoid overlaps. Equivalent maps to the label after
            compute; remark is PASSED / CND / FAILED.
          </p>

          <div className="mt-3 space-y-2">
              <div className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-3 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                <span>Min %</span>
                <span>Max %</span>
                <span>Equivalent</span>
                <span>Remark</span>
                <span className="text-right">Actions</span>
              </div>
              {gradeEquivalence.length === 0 ? (
                <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/30 px-3 py-10 text-center text-sm text-foreground-muted">
                  <p>No ranges configured yet.</p>
                  <p className="mt-2 text-xs">
                    Use <strong className="text-foreground">Reset to MMSU Default</strong> for the standard bands, or{" "}
                    <strong className="text-foreground">Add Range</strong> for a custom row.
                  </p>
                </div>
              ) : (
                gradeEquivalence.map((row, ri) => {
                  const parsedEquiv = Number(row.letter);
                  const isNumericEquiv = row.letter.trim() !== "" && Number.isFinite(parsedEquiv);
                  return (
                    <div key={row.id ?? `eq-${ri}`} className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-3 items-center">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        value={Number.isFinite(row.minPercent) ? row.minPercent : 0}
                        onChange={(e) => updateEquivalenceRow(ri, { minPercent: Number(e.target.value) })}
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        value={Number.isFinite(row.maxPercent) ? row.maxPercent : 0}
                        onChange={(e) => updateEquivalenceRow(ri, { maxPercent: Number(e.target.value) })}
                      />
                      {isNumericEquiv ? (
                        <input
                          type="number"
                          min={0}
                          max={5}
                          step={0.01}
                          className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          value={parsedEquiv}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              updateEquivalenceRow(ri, { letter: "" });
                              return;
                            }
                            const n = Number(raw);
                            if (Number.isFinite(n)) updateEquivalenceRow(ri, { letter: String(n) });
                          }}
                        />
                      ) : (
                        <input
                          type="text"
                          className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          value={row.letter}
                          placeholder="e.g. 1.25 or A"
                          onChange={(e) => updateEquivalenceRow(ri, { letter: e.target.value })}
                        />
                      )}
                      <select
                        className="h-10 rounded-md border border-border-strong bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        value={normalizeEquivalenceRemark(row.remarks)}
                        onChange={(e) =>
                          updateEquivalenceRow(ri, { remarks: e.target.value as GradeEquivalenceRemarkOption })
                        }
                      >
                        {GRADE_EQUIVALENCE_REMARK_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          aria-label="Remove range"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-danger hover:bg-danger-muted"
                          onClick={() => removeEquivalenceRow(ri)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addEquivalenceRow}
              className="inline-flex items-center justify-center gap-1 rounded border border-border-strong bg-surface px-2 py-1 text-xs text-foreground hover:bg-surface-hover"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add Range
            </button>
            <button
              type="button"
              onClick={resetEquivalenceToMmsuDefault}
              className="rounded border border-border-strong bg-surface px-2 py-1 text-xs text-foreground hover:bg-surface-hover"
            >
              Reset to MMSU Default
            </button>
            <button
              type="button"
              onClick={clearEquivalenceOverrides}
              className="rounded px-2 py-1 text-xs text-foreground hover:bg-surface-hover"
            >
              Use MMSU Default (No Overrides)
            </button>
            <button
              type="button"
              onClick={sortEquivalenceByMin}
              className="rounded border border-border-strong bg-surface px-2 py-1 text-xs text-foreground hover:bg-surface-hover"
            >
              Sort by min %
            </button>
            <button
              type="button"
              onClick={loadSampleEquivalenceOnly}
              className="rounded border border-dashed border-border-strong bg-surface px-2 py-1 text-xs text-foreground-muted hover:bg-surface-hover"
            >
              Load A–F sample
            </button>
          </div>
          <PanelSaveRow
            saving={saving}
            label="Save equivalence table"
            footnote={EQUIVALENCE_SAVE_FOOTNOTE}
            onSave={() => void persistEquivalenceOnly()}
          />
        </div>
      </CollapsibleCard>

      {(localSettingsError || !categoryWeightOk) && (
        <div className="mb-3 rounded border border-warning/40 bg-warning/10 px-2 py-2 text-xs text-warning">
          {localSettingsError}
          {!localSettingsError && !categoryWeightOk && (
            <p>The component weights of all categories should add up to 100 (now {categoryWeightSum.toFixed(2)}).</p>
          )}
        </div>
      )}

      <CollapsibleCard
        open={formulaSectionOpen}
        onToggle={() => setFormulaSectionOpen((o) => !o)}
        title={
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <span>Grading formula &amp; categories</span>
            <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground-muted">
              {categories.length} categor{categories.length === 1 ? "y" : "ies"}
            </span>
          </h3>
        }
        summaryClosed={
          <p className="mt-1 text-xs text-foreground-muted">
            Default weights, copy from another subject, advanced JSON, and category / component weights (hover section title for weight rules).
          </p>
        }
        summaryOpen={
          <p className="mt-1 text-sm text-foreground-muted">Define how raw scores roll up to a final grade and which CSV columns map in.</p>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadTemplate}
            className="rounded border border-border-strong bg-surface px-2 py-1 text-xs text-foreground hover:bg-surface-hover"
          >
            Load default weights
          </button>
          <button
            type="button"
            onClick={addCategory}
            className="rounded border border-border-strong bg-surface px-2 py-1 text-xs text-foreground hover:bg-surface-hover"
          >
            Add category
          </button>
          {!advancedOpen ? (
            <button
              type="button"
              onClick={openAdvanced}
              className="rounded border border-border-strong bg-surface px-2 py-1 text-xs text-foreground hover:bg-surface-hover"
            >
              Advanced JSON
            </button>
          ) : (
            <>
              <button type="button" onClick={() => void applyAdvancedJson()} className="rounded border border-primary bg-primary-muted px-2 py-1 text-xs font-medium text-primary">
                Apply JSON
              </button>
              <button type="button" onClick={() => setAdvancedOpen(false)} className="rounded border border-border-strong px-2 py-1 text-xs hover:bg-surface-hover">
                Close
              </button>
            </>
          )}
        </div>

        {advancedOpen && (
          <textarea
            className="mb-3 h-36 w-full rounded border border-border-strong bg-surface px-2 py-1.5 font-mono text-xs text-foreground"
            value={advancedJson}
            onChange={(e) => setAdvancedJson(e.target.value)}
            spellCheck={false}
          />
        )}

        {expectedKeys.length > 0 && (
          <p className="mb-3 text-xs text-foreground">
            <span className="font-medium">Grade columns used in formula:</span> {expectedKeys.join(", ")}
            <span className="block mt-0.5">CSV / record keys must match these names (including spaces).</span>
          </p>
        )}

        {copySources.some((x) => Array.isArray((x.gradingSystem as { categories?: unknown } | null | undefined)?.categories) && ((x.gradingSystem as { categories: unknown[] }).categories.length > 0)) && (
          <div className="mb-3 rounded border border-border bg-surface-muted/40 p-3 text-xs">
            <p className="mb-2 font-medium text-foreground">Copy the formula from another subject</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-[12rem] flex-1 flex-col gap-0.5 text-xs font-medium text-foreground">
                Subject
                <select
                  aria-label="Copy formula from"
                  className="rounded border border-border bg-surface px-2 py-1 text-sm font-normal text-foreground"
                  value={copyFrom}
                  onChange={(e) => {
                    setCopyFrom(e.target.value);
                    setCopyNote(null);
                  }}
                >
                  <option value="">Choose a subject…</option>
                  {copySources
                    .filter((x) => Array.isArray((x.gradingSystem as { categories?: unknown } | null | undefined)?.categories) && (x.gradingSystem as { categories: unknown[] }).categories.length > 0)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}{x.code ? ` (${x.code})` : ""}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!copyFrom}
                onClick={copyFormula}
                className="rounded border border-border-strong bg-surface px-3 py-1 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-50"
              >
                Copy formula
              </button>
            </div>
            <p className="mt-2 text-foreground-muted">Components are matched by their grade columns; one that matches nothing in this subject is skipped. This replaces the formula below, but nothing is saved until you press Save formula.</p>
            {copyNote && (
              <p className={`mt-2 rounded px-2 py-1.5 ${copyNote.ok ? "bg-primary-muted text-foreground" : "bg-warning-muted text-warning"}`} role="status">
                {copyNote.text}
              </p>
            )}
          </div>
        )}

        <div className="border-t border-border pt-3">
          <h4
            className="mb-3 w-fit cursor-help text-sm font-semibold text-foreground underline decoration-dotted decoration-border-strong underline-offset-4"
            title={CATEGORY_WEIGHTS_TOOLTIP}
          >
            Category &amp; component weights
          </h4>
          <p className="-mt-1 mb-3 text-xs text-foreground-muted">
            Type each component&apos;s share of the final grade. A category total is the sum of its components, so all components together should add up to 100.
          </p>
          {startedFromDefault && (
            <p className="mb-3 rounded bg-primary-muted px-2 py-1.5 text-xs text-foreground" role="status">
              This subject has no formula yet, so it starts from the default weights: Major Exams (Midterms 15 + Finals 15) and Major Outputs (70). Columns were matched by name; pick a column for any component that has none, adjust the weights if you need to, then press Save formula.
            </p>
          )}
          {weightsConverted && (
            <p className="mb-3 rounded bg-primary-muted px-2 py-1.5 text-xs text-foreground" role="status">
              These settings were saved with weights inside each category. They are shown here as a share of the final grade, which gives every student the same result as before. Save the formula to keep the new form.
            </p>
          )}
        </div>

        <div className="space-y-3">
        {categories.length === 0 && (
          <p className="text-xs text-foreground">
            No grading structure yet. Add a category or load the default weights so &quot;Compute grades&quot; has a formula to run.
          </p>
        )}
        {categories.map((cat, ci) => {
          const compSum = sumWeights(cat.components);
          const compWeightsPositive =
            cat.components.length === 0 ||
            (Number.isFinite(compSum) && compSum > 0 && !cat.components.some((c) => c.weight < 0));
          const compSumIsHundred = Math.abs(compSum - 100) < 0.02;
          return (
            <div key={cat.id ?? `cat-${ci}`} className="rounded border border-border-strong p-3">
              <div className="mb-2 flex flex-wrap items-end gap-2">
                <label className="flex min-w-[140px] flex-1 flex-col gap-0.5 text-xs font-medium text-foreground">
                  Category name
                  <input
                    className="rounded border border-border px-2 py-1 text-sm font-normal text-foreground"
                    value={cat.name}
                    onChange={(e) => updateCategory(ci, { name: e.target.value })}
                  />
                </label>
                <label className="flex w-[8.5rem] flex-col gap-0.5 text-xs font-medium text-foreground">
                  Total % of final
                  <input
                    type="number"
                    readOnly
                    tabIndex={-1}
                    aria-label={`${cat.name} total, the sum of its components`}
                    title="The sum of this category's component weights"
                    className="rounded border border-border bg-surface-muted px-2 py-1 text-sm font-semibold text-foreground"
                    value={Number.isFinite(cat.weight) ? cat.weight : 0}
                  />
                </label>
                <button type="button" className="text-xs text-danger" onClick={() => removeCategory(ci)}>
                  Remove category
                </button>
              </div>
              {!compWeightsPositive && (
                <p className="mb-2 text-xs text-warning">
                  Component weights here must be zero or more and add up to more than zero (now{" "}
                  {Number.isFinite(compSum) ? compSum.toFixed(2) : "—"}).
                </p>
              )}
              {compWeightsPositive && cat.components.length > 0 && compSumIsHundred && (
                <p className="mb-2 text-xs text-foreground-muted">This category alone is the whole final grade.</p>
              )}
              <div className="space-y-2 border-t border-border pt-2">
                {cat.components.map((comp, xi) => (
                  <div key={comp.id ?? `comp-${ci}-${xi}`} className="flex flex-wrap items-end gap-2 rounded bg-surface-muted/50 px-2 py-2">
                    <label className="flex min-w-[120px] flex-1 flex-col gap-0.5 text-xs font-medium text-foreground">
                      Component
                      <input
                        className="rounded border border-border bg-surface px-2 py-1 text-sm font-normal text-foreground"
                        value={comp.name}
                        onChange={(e) => updateComponent(ci, xi, { name: e.target.value })}
                      />
                    </label>
                    <label className="flex w-[5.5rem] flex-col gap-0.5 text-xs font-medium text-foreground">
                      % of final
                      <input
                        type="number"
                        className="rounded border border-border bg-surface px-2 py-1 text-sm font-normal text-foreground"
                        value={Number.isFinite(comp.weight) ? comp.weight : 0}
                        onChange={(e) => updateComponent(ci, xi, { weight: Number(e.target.value) })}
                      />
                    </label>
                    <button type="button" className="text-xs text-danger" onClick={() => removeComponent(ci, xi)}>
                      Remove
                    </button>
                    <GradeKeyPicker
                      available={availableKeys}
                      selected={comp.gradeKeys}
                      usedElsewhere={usedByOthers(ci, xi)}
                      onChange={(keys) => updateComponent(ci, xi, { gradeKeys: keys })}
                    />
                  </div>
                ))}
                <button type="button" onClick={() => addComponent(ci)} className="text-xs text-primary hover:underline">
                  + Add component
                </button>
              </div>
            </div>
          );
        })}
        </div>
        <PanelSaveRow
          saving={saving}
          label="Save formula"
          footnote={FORMULA_SAVE_FOOTNOTE}
          onSave={() => void persistFormulaOnly()}
        />
      </CollapsibleCard>

      {records.length > 0 && (
        <CollapsibleCard
          open={previewSectionOpen}
          onToggle={() => setPreviewSectionOpen((o) => !o)}
          title={<h3 className="text-base font-semibold tracking-tight text-foreground">Preview (same math as server)</h3>}
          summaryClosed={<p className="mt-1 text-xs text-foreground-muted">Pick a record to sanity-check final % and policy output.</p>}
          summaryOpen={<p className="mt-1 text-sm text-foreground-muted">Uses the same weighted formula and grade table as compute on the server.</p>}
        >
        <div className="rounded border border-border bg-surface-muted/20 px-3 py-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="text-xs text-foreground-muted">
              Record
              <select
                className="ml-1 rounded border border-border bg-surface px-2 py-1 text-xs"
                value={previewRecord?.id ?? ""}
                onChange={(e) => setPreviewRecordId(e.target.value)}
              >
                {records.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.studentName} ({r.studentNumber})
                  </option>
                ))}
              </select>
            </label>
            {preview && preview.incomplete && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">
                  Final: <span className="text-warning">INC</span>
                </span>
                <span className="text-xs text-foreground-muted">
                  No score for {preview.missingKeys.join(", ")}. Enter 0 for an item to count it as zero.
                </span>
              </div>
            )}
            {preview && !preview.incomplete && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">
                  Final: <span className="text-primary">{preview.finalGrade}</span>
                </span>
                {preview.letterGrade && (
                  <span className="rounded bg-surface-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                    {preview.letterGrade}
                  </span>
                )}
                {preview.passed !== null && (
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      preview.passed ? "bg-success-muted text-success" : "bg-danger-muted text-danger"
                    }`}
                  >
                    {preview.passed ? "Pass" : "Fail"}
                  </span>
                )}
                {preview.remarks && <span className="text-xs text-foreground-muted">({preview.remarks})</span>}
              </div>
            )}
          </div>
          {preview && preview.breakdown.length > 0 && (
            <ul className="list-inside list-disc text-xs text-foreground-muted">
              {(preview.breakdown as { name?: string; score?: number; weight?: number }[]).map((row, i) => (
                <li key={`${row.name}-${i}`}>
                  {row.name ?? "Category"}: {typeof row.score === "number" ? row.score.toFixed(2) : "—"}% weighted (category weight {row.weight ?? "—"}%)
                </li>
              ))}
            </ul>
          )}
        </div>
        </CollapsibleCard>
      )}
    </div>
  );
}
