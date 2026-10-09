import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { Copy, Eye, KeyRound, Link2, Mail, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { Dialog } from "../../components/ui/dialog";
import { GradingSystemSettingsPanel } from "../../features/experimental/GradingSystemSettingsPanel";
import { collectGradeKeys, normalizeGradingSystemFromUnknown } from "../../features/experimental/gradingSystemModel";

type GradeSubject = {
  id: string;
  name: string;
  code?: string | null;
  ownerId: string;
  departmentId?: string | null;
  gradingSystem?: Record<string, unknown> | null;
  studentComputeEnabled: boolean;
  owner: { id: string; name: string; role: string; departmentId: string | null };
  _count: { records: number; viewers: number };
};

type GradeRecord = {
  id: string;
  studentName: string;
  studentNumber: string;
  email?: string | null;
  code: string;
  grades: Record<string, number>;
  maxScores?: Record<string, number> | null;
  computedGrade?: {
    finalGrade?: number;
    breakdown?: unknown;
    computedAt?: string;
    letterGrade?: string | null;
    remarks?: string | null;
    passed?: boolean | null;
    passingGrade?: number | null;
  } | null;
  emailSentAt?: string | null;
};

/** Column names shown in Edit record: table columns plus any keys only on this row. */
function mergeGradeKeysForEdit(record: GradeRecord, columnKeys: string[]): string[] {
  const set = new Set<string>(columnKeys);
  Object.keys(record.grades ?? {}).forEach((k) => set.add(k));
  Object.keys(record.maxScores ?? {}).forEach((k) => set.add(k));
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** One cell: raw score, or compact `score/max` when maxScores defines a max for that key. */
function formatGradeCell(record: GradeRecord, key: string): string {
  const grades = record.grades as Record<string, number> | undefined;
  if (!grades || typeof grades !== "object") return "—";
  const raw = grades[key];
  if (raw === undefined || raw === null || Number.isNaN(Number(raw))) return "—";
  const maxScores = record.maxScores as Record<string, number> | null | undefined;
  const max = maxScores?.[key];
  if (max !== undefined && Number.isFinite(Number(max))) return `${Number(raw)}/${Number(max)}`;
  return String(Number(raw));
}

function shortSentAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return null;
  }
}

/**
 * Short random token for destructive confirmations — avoids ambiguous glyphs (0/O, 1/I) so
 * typing what you see matches what we validate.
 */
function generateDeleteRecordChallengeToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars.charAt(b % chars.length)).join("");
}

/** Per–grade-subject last successful Google Sheet import URL (browser localStorage). */
const IMPORT_SHEET_URL_STORAGE_KEY = "coe.vantage.gradeSubject.importSheetUrl.v1";

function readImportSheetUrlMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(IMPORT_SHEET_URL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function readStoredImportSheetUrl(subjectId: string): string {
  return readImportSheetUrlMap()[subjectId] ?? "";
}

function persistImportSheetUrl(subjectId: string, sheetUrl: string): void {
  try {
    const next = { ...readImportSheetUrlMap(), [subjectId]: sheetUrl };
    localStorage.setItem(IMPORT_SHEET_URL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // QuotaExceededError or private mode — ignore
  }
}

/** Server `computeFinal` stores `breakdown` as an array of categories with nested `components`. */
type ComputedBreakdownComponent = {
  id?: string;
  name?: string;
  weight?: number;
  scorePercent?: number;
};

type ComputedBreakdownCategory = {
  id?: string;
  name?: string;
  weight?: number;
  score?: number;
  components?: ComputedBreakdownComponent[];
};

function asComputedBreakdownCategories(breakdown: unknown): ComputedBreakdownCategory[] | null {
  if (!Array.isArray(breakdown)) return null;
  return breakdown as ComputedBreakdownCategory[];
}

/** Single string for client-side record search (identity + grades + computed summary). */
function recordSearchHaystack(record: GradeRecord): string {
  const parts: string[] = [
    record.studentName,
    record.studentNumber,
    record.email ?? "",
    record.code,
  ];
  const grades = record.grades;
  if (grades && typeof grades === "object" && !Array.isArray(grades)) {
    for (const [k, v] of Object.entries(grades)) {
      parts.push(k, String(v));
    }
  }
  const maxScores = record.maxScores;
  if (maxScores && typeof maxScores === "object" && !Array.isArray(maxScores)) {
    for (const [k, v] of Object.entries(maxScores)) {
      parts.push(k, String(v));
    }
  }
  const cg = record.computedGrade;
  if (cg) {
    if (cg.finalGrade !== undefined && cg.finalGrade !== null) parts.push(String(cg.finalGrade));
    if (cg.letterGrade) parts.push(String(cg.letterGrade));
    if (cg.remarks) parts.push(String(cg.remarks));
    if (cg.passingGrade !== undefined && cg.passingGrade !== null) parts.push(String(cg.passingGrade));
    if (cg.passed === true) parts.push("pass", "passed", "yes");
    if (cg.passed === false) parts.push("fail", "failed", "no");
    if (cg.computedAt) parts.push(cg.computedAt);
    if (cg.breakdown != null) {
      try {
        parts.push(JSON.stringify(cg.breakdown));
      } catch {
        // ignore
      }
    }
  }
  return parts.join(" ").toLowerCase();
}

function ComputedBreakdownSection({ breakdown }: { breakdown: unknown }) {
  const categories = asComputedBreakdownCategories(breakdown);
  if (categories && categories.length > 0) {
    return (
      <div className="mt-2 space-y-2 border-t border-border pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Breakdown</p>
        <div className="space-y-2">
          {categories.map((cat, catIdx) => {
            const catLabel = String(cat.name ?? cat.id ?? `Category ${catIdx + 1}`);
            const catWeight = Number(cat.weight ?? 0);
            const catScore = Number(cat.score ?? 0);
            const comps = Array.isArray(cat.components) ? cat.components : [];
            return (
              <div key={`${catLabel}-${catIdx}`} className="rounded border border-border/70 bg-surface-muted/30 p-2">
                <div className="text-xs font-medium text-foreground">
                  {catLabel}
                  <span className="ml-1 font-normal text-foreground-muted">
                    (category weight {catWeight}% · weighted score {Number.isFinite(catScore) ? catScore.toFixed(2) : "—"}%)
                  </span>
                </div>
                {comps.length > 0 ? (
                  <table className="mt-2 w-full border-collapse text-[10px]">
                    <thead>
                      <tr className="border-b border-border text-left text-foreground-muted">
                        <th className="py-1 pr-2 font-medium">Component</th>
                        <th className="py-1 pr-2 font-medium">Weight</th>
                        <th className="py-1 font-medium">Score %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comps.map((comp, compIdx) => {
                        const compLabel = String(comp.name ?? comp.id ?? `Component ${compIdx + 1}`);
                        const w = Number(comp.weight ?? 0);
                        const sp = Number(comp.scorePercent ?? 0);
                        return (
                          <tr key={`${compLabel}-${compIdx}`} className="border-t border-border/60">
                            <td className="py-1 pr-2 text-foreground">{compLabel}</td>
                            <td className="py-1 pr-2 tabular-nums text-foreground-muted">{Number.isFinite(w) ? w : "—"}</td>
                            <td className="py-1 tabular-nums text-foreground">
                              {Number.isFinite(sp) ? sp.toFixed(2) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="mt-1 text-[10px] text-foreground-muted">No components in this category.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (breakdown != null && typeof breakdown === "object") {
    return (
      <div className="mt-2 space-y-1 border-t border-border pt-2">
        <p className="text-[10px] font-medium text-foreground-muted">Breakdown (legacy shape)</p>
        <pre className="max-h-48 overflow-auto rounded border border-border bg-surface-muted/20 p-2 font-mono text-[10px] leading-relaxed text-foreground">
          {JSON.stringify(breakdown, null, 2)}
        </pre>
      </div>
    );
  }
  if (breakdown != null && breakdown !== "") {
    return (
      <div className="mt-2 border-t border-border pt-2">
        <p className="mb-1 text-[10px] text-foreground-muted">Breakdown</p>
        <p className="font-mono text-xs text-foreground">{String(breakdown)}</p>
      </div>
    );
  }
  return null;
}

/** Percent of score vs max for this key; max defaults to 100 when not in maxScores. */
function gradeScoreRatio(record: GradeRecord, key: string): number | null {
  const grades = record.grades as Record<string, number> | undefined;
  if (!grades || typeof grades !== "object") return null;
  const raw = grades[key];
  if (raw === undefined || raw === null || Number.isNaN(Number(raw))) return null;
  const score = Number(raw);
  const maxScores = record.maxScores as Record<string, number> | null | undefined;
  const maxRaw = maxScores?.[key];
  const max = maxRaw !== undefined && Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : 100;
  if (max <= 0) return null;
  return (score / max) * 100;
}

type GradeBand = "high" | "mid" | "low" | "missing";

/** Points below passing % treated as “approaching” (amber) for raw score / max highlights. */
const NEAR_PASSING_BAND_POINTS = 15;

/**
 * Score vs column max (0–100): green at/above subject passing %, amber in the band just below, red lower.
 * `passingThreshold` comes from grading settings (default 75 when unset).
 */
function gradeBandFromRatioVsPassing(ratioPercent: number | null, passingThreshold: number): GradeBand {
  if (ratioPercent === null) return "missing";
  if (ratioPercent >= passingThreshold) return "high";
  const nearFloor = Math.max(0, passingThreshold - NEAR_PASSING_BAND_POINTS);
  if (ratioPercent >= nearFloor) return "mid";
  return "low";
}

function gradeCellClassName(record: GradeRecord, key: string, passingThreshold: number): string {
  const ratio = gradeScoreRatio(record, key);
  const band = gradeBandFromRatioVsPassing(ratio, passingThreshold);
  const base = "m-0 p-0 whitespace-nowrap text-center font-mono text-xs transition-colors";
  switch (band) {
    case "high":
      return `${base} bg-success-muted/90 font-medium text-success`;
    case "mid":
      return `${base} bg-warning/15 font-medium text-foreground`;
    case "low":
      return `${base} bg-danger/12 font-medium text-danger`;
    case "missing":
      return `${base} bg-surface-muted/60 text-foreground-muted`;
  }
}

/** True when remarks already encode pass/fail (MMSU-style); avoids duplicating a “Pass” line. */
function isStructuredOutcomeRemark(remarks: string | null | undefined): boolean {
  const r = (remarks ?? "").trim().toUpperCase();
  return r === "PASSED" || r === "CND" || r === "FAILED" || r === "PASS" || r === "FAIL";
}

type FinalGradeBand = "high" | "cnd" | "mid" | "low" | "missing";

/**
 * Final column styling from grade-equivalence **remarks** and pass/fail, not fixed 85/70 on the numeric final.
 */
function finalGradeBandFromComputed(record: GradeRecord): FinalGradeBand {
  const cg = record.computedGrade;
  if (!cg) return "missing";
  const f = cg.finalGrade;
  if (f === undefined || f === null || Number.isNaN(Number(f))) return "missing";

  const remarks = (cg.remarks ?? "").trim().toUpperCase();
  if (remarks === "FAILED" || remarks === "FAIL") return "low";
  if (remarks === "CND") return "cnd";
  if (remarks === "PASSED" || remarks === "PASS") return "high";

  if (cg.passed === true) return "high";
  if (cg.passed === false) return "low";

  const pg = cg.passingGrade;
  if (pg !== undefined && pg !== null && Number.isFinite(Number(pg)) && Number.isFinite(Number(f))) {
    return Number(f) >= Number(pg) ? "high" : "low";
  }
  return "mid";
}

function finalGradeClassName(record: GradeRecord, variant: "table-cell" | "inline" = "table-cell"): string {
  const base =
    variant === "table-cell"
      ? "whitespace-nowrap px-3 py-2 font-medium rounded-sm"
      : "inline-block rounded-sm px-2 py-1 font-medium";
  const band = finalGradeBandFromComputed(record);
  switch (band) {
    case "high":
      return `${base} bg-success-muted/90 text-success`;
    case "cnd":
      return `${base} bg-warning-muted/90 text-warning`;
    case "mid":
      return `${base} bg-warning-muted/70 text-warning`;
    case "low":
      return `${base} bg-danger/12 text-danger`;
    case "missing":
      return `${base} text-foreground-muted`;
  }
}

type RecordCompletion = {
  filled: number;
  total: number;
  pct: number;
  missingKeys: string[];
  status: "complete" | "partial" | "empty" | "na";
};

/** Expected keys come from the grading system when configured; otherwise from displayed grade columns. */
function getRecordCompletion(record: GradeRecord, expectedKeys: string[]): RecordCompletion {
  if (expectedKeys.length === 0) {
    return { filled: 0, total: 0, pct: 100, missingKeys: [], status: "na" };
  }
  const grades = record.grades ?? {};
  const missingKeys: string[] = [];
  let filled = 0;
  for (const k of expectedKeys) {
    const v = grades[k];
    if (v !== undefined && v !== null && Number.isFinite(Number(v))) filled += 1;
    else missingKeys.push(k);
  }
  const total = expectedKeys.length;
  const pct = Math.round((filled / total) * 100);
  let status: RecordCompletion["status"];
  if (filled === 0) status = "empty";
  else if (filled === total) status = "complete";
  else status = "partial";
  return { filled, total, pct, missingKeys, status };
}

function completionBadgeClasses(status: RecordCompletion["status"]): string {
  switch (status) {
    case "complete":
      return "bg-success-muted text-success";
    case "partial":
      return "bg-warning/20 text-warning";
    case "empty":
      return "bg-surface-muted text-foreground-muted";
    default:
      return "bg-border/40 text-foreground-muted";
  }
}

function completionLabel(status: RecordCompletion["status"]): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "partial":
      return "Partial";
    case "empty":
      return "Missing";
    default:
      return "—";
  }
}

type Viewer = {
  userId: string;
  canEdit: boolean;
  user: { id: string; name: string; email: string; role: string };
};

type ViewerCandidate = { id: string; name: string; email: string; role: string };

/** Shared grade grid for Add / Edit record dialogs — keeps typography and layout identical. */
type RecordGradeGridEditorProps = {
  gradeKeys: string[];
  gradeValues: Record<string, string>;
  maxValues: Record<string, string>;
  newKeyInput: string;
  onNewKeyInputChange: (value: string) => void;
  onGradeChange: (key: string, value: string) => void;
  onMaxChange: (key: string, value: string) => void;
  onAppendColumn: () => void;
};

function RecordGradeGridEditor({
  gradeKeys,
  gradeValues,
  maxValues,
  newKeyInput,
  onNewKeyInputChange,
  onGradeChange,
  onMaxChange,
  onAppendColumn,
}: RecordGradeGridEditorProps) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-foreground">Grade columns</p>
      <div className="max-h-[min(24rem,50vh)] overflow-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-surface-muted">
            <tr className="text-left text-xs">
              <th className="px-3 py-2 font-medium text-foreground">Column</th>
              <th className="px-3 py-2 font-medium text-foreground">Score</th>
              <th className="px-3 py-2 font-medium text-foreground">Max</th>
            </tr>
          </thead>
          <tbody>
            {gradeKeys.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-xs text-foreground-muted">
                  No columns yet. Add a column name below or use grading settings / import to define keys.
                </td>
              </tr>
            ) : (
              gradeKeys.map((key) => (
                <tr key={key} className="border-t border-border">
                  <td className="px-3 py-2 align-middle font-mono text-xs text-foreground" title={key}>
                    <span className="line-clamp-2 break-all">{key}</span>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full min-w-[4rem] rounded border border-border bg-background px-2 py-1 text-sm font-mono text-foreground"
                      value={gradeValues[key] ?? ""}
                      onChange={(e) => onGradeChange(key, e.target.value)}
                      placeholder="—"
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full min-w-[4rem] rounded border border-border bg-background px-2 py-1 text-sm font-mono text-foreground"
                      value={maxValues[key] ?? ""}
                      onChange={(e) => onMaxChange(key, e.target.value)}
                      placeholder="100"
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-0.5 text-xs font-medium text-foreground">
          New column name
          <input
            className="rounded border border-border-strong bg-background px-2 py-1.5 text-sm font-normal text-foreground"
            value={newKeyInput}
            onChange={(e) => onNewKeyInputChange(e.target.value)}
            placeholder="Matches CSV / grading formula key"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAppendColumn();
              }
            }}
          />
        </label>
        <button
          type="button"
          className="rounded border border-border-strong bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover"
          onClick={() => onAppendColumn()}
        >
          Add column
        </button>
      </div>
    </div>
  );
}

export function ExperimentalGradesPage() {
  const [subjects, setSubjects] = useState<GradeSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [records, setRecords] = useState<GradeRecord[]>([]);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [viewerCandidates, setViewerCandidates] = useState<ViewerCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectCode, setNewSubjectCode] = useState("");

  const [recordName, setRecordName] = useState("");
  const [recordNumber, setRecordNumber] = useState("");
  const [recordEmail, setRecordEmail] = useState("");
  const [recordCode, setRecordCode] = useState("");
  const [addGradeKeys, setAddGradeKeys] = useState<string[]>([]);
  const [addGradeValues, setAddGradeValues] = useState<Record<string, string>>({});
  const [addMaxValues, setAddMaxValues] = useState<Record<string, string>>({});
  const [addNewGradeKey, setAddNewGradeKey] = useState("");
  const [importPreviewCount, setImportPreviewCount] = useState(0);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    removed: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  /** Validation / API errors for Import dialog only (not the main page banner). */
  const [importDialogError, setImportDialogError] = useState<string | null>(null);
  const [googleSheetUrl, setGoogleSheetUrl] = useState("");

  const [candidateId, setCandidateId] = useState("");
  const [candidateCanEdit, setCandidateCanEdit] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editRecordName, setEditRecordName] = useState("");
  const [editRecordNumber, setEditRecordNumber] = useState("");
  const [editRecordEmail, setEditRecordEmail] = useState("");
  const [editRecordCode, setEditRecordCode] = useState("");
  const [editGradeKeys, setEditGradeKeys] = useState<string[]>([]);
  const [editGradeValues, setEditGradeValues] = useState<Record<string, string>>({});
  const [editMaxValues, setEditMaxValues] = useState<Record<string, string>>({});
  const [editNewGradeKey, setEditNewGradeKey] = useState("");

  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [viewRecord, setViewRecord] = useState<GradeRecord | null>(null);
  /** Record queued for delete; dialog shows a typed challenge before calling the API. */
  const [deleteRecordTarget, setDeleteRecordTarget] = useState<GradeRecord | null>(null);
  const [deleteRecordChallenge, setDeleteRecordChallenge] = useState("");
  const [deleteRecordChallengeInput, setDeleteRecordChallengeInput] = useState("");
  /** Student row context for regenerate-code confirmation (replaces window.confirm). */
  const [regenerateCodeTarget, setRegenerateCodeTarget] = useState<{
    id: string;
    studentName: string;
    studentNumber: string;
  } | null>(null);
  const [recordSearch, setRecordSearch] = useState("");

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === selectedSubjectId) ?? null,
    [subjects, selectedSubjectId]
  );

  /** Fingerprint for grading settings panel so reopening the dialog re-syncs from the latest `gradingSystem` JSON. */
  const gradingSystemSnapshot = useMemo(
    () => JSON.stringify(selectedSubject?.gradingSystem ?? null),
    [selectedSubject]
  );

  /** Column order: grading-system keys first (when set), then any other keys found on records, sorted. */
  const gradeColumnKeys = useMemo(() => {
    const fromSystem =
      selectedSubject?.gradingSystem != null
        ? collectGradeKeys(normalizeGradingSystemFromUnknown(selectedSubject.gradingSystem))
        : [];
    const fromRecords = new Set<string>();
    for (const r of records) {
      if (r.grades && typeof r.grades === "object" && !Array.isArray(r.grades)) {
        Object.keys(r.grades).forEach((k) => fromRecords.add(k));
      }
    }
    const ordered: string[] = [];
    for (const k of fromSystem) {
      if (fromRecords.has(k)) ordered.push(k);
    }
    const rest = Array.from(fromRecords)
      .filter((k) => !ordered.includes(k))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return [...ordered, ...rest];
  }, [records, selectedSubject?.gradingSystem]);

  /** Keys required for “completion” — grading-system formula keys when set, else visible columns. */
  const expectedKeysForCompletion = useMemo(() => {
    const system = selectedSubject?.gradingSystem
      ? normalizeGradingSystemFromUnknown(selectedSubject.gradingSystem)
      : null;
    if (system && system.categories.length > 0) {
      const keys = collectGradeKeys(system);
      if (keys.length > 0) return keys;
    }
    return gradeColumnKeys;
  }, [selectedSubject?.gradingSystem, gradeColumnKeys]);

  /** Passing % from grading settings — drives score-cell green/amber/red vs each column’s max (default 75). */
  const passingPercentForHighlights = useMemo(() => {
    if (!selectedSubject?.gradingSystem) return 75;
    const n = normalizeGradingSystemFromUnknown(selectedSubject.gradingSystem);
    const pg = n.passingGrade;
    if (pg !== undefined && Number.isFinite(pg) && pg >= 0 && pg <= 100) return pg;
    return 75;
  }, [selectedSubject?.gradingSystem]);

  const recordTableColCount = useMemo(() => 9 + gradeColumnKeys.length, [gradeColumnKeys.length]);
  const filteredRecords = useMemo(() => {
    const q = recordSearch.trim().toLowerCase();
    if (!q) return records;
    return records.filter((record) => recordSearchHaystack(record).includes(q));
  }, [records, recordSearch]);

  const initAddRecordGradeGrid = () => {
    const keys = [...gradeColumnKeys].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    setAddGradeKeys(keys);
    const gv: Record<string, string> = {};
    const mv: Record<string, string> = {};
    for (const k of keys) {
      gv[k] = "";
      mv[k] = "";
    }
    setAddGradeValues(gv);
    setAddMaxValues(mv);
    setAddNewGradeKey("");
  };

  const appendAddGradeField = () => {
    const k = addNewGradeKey.trim();
    if (!k) return;
    if (addGradeKeys.includes(k)) {
      setError(`Column "${k}" is already in the list.`);
      return;
    }
    setError(null);
    setAddGradeKeys((prev) =>
      [...prev, k].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    );
    setAddGradeValues((prev) => ({ ...prev, [k]: "" }));
    setAddMaxValues((prev) => ({ ...prev, [k]: "" }));
    setAddNewGradeKey("");
  };

  async function loadSubjects() {
    const { data } = await apiClient.get<GradeSubject[]>("/grade-subjects");
    setSubjects(data);
    if (!selectedSubjectId && data.length > 0) setSelectedSubjectId(data[0].id);
    if (selectedSubjectId && !data.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(data[0]?.id ?? null);
    }
  }

  async function loadSubjectDetails(subjectId: string) {
    const [recordsRes, viewersRes, candidatesRes] = await Promise.all([
      apiClient.get<GradeRecord[]>(`/grade-subjects/${subjectId}/records`),
      apiClient.get<Viewer[]>(`/grade-subjects/${subjectId}/viewers`),
      apiClient.get<ViewerCandidate[]>(`/grade-subjects/${subjectId}/viewer-candidates`),
    ]);
    setRecords(recordsRes.data);
    setViewers(viewersRes.data);
    setViewerCandidates(candidatesRes.data);
  }

  useEffect(() => {
    setLoading(true);
    loadSubjects()
      .catch(() => setError("Failed to load grade subjects."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSubjectId) {
      setRecords([]);
      setViewers([]);
      setViewerCandidates([]);
      return;
    }
    setLoading(true);
    loadSubjectDetails(selectedSubjectId)
      .catch(() => setError("Failed to load selected subject details."))
      .finally(() => setLoading(false));
  }, [selectedSubjectId]);

  useEffect(() => {
    setSelectedRecordIds(new Set());
    setRecordSearch("");
    if (!selectedSubjectId) {
      setGoogleSheetUrl("");
    } else {
      // Restore last successful sheet import link for this subject (see persistImportSheetUrl).
      setGoogleSheetUrl(readStoredImportSheetUrl(selectedSubjectId));
    }
  }, [selectedSubjectId]);

  const createSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSubjectName.trim();
    if (!name) {
      setError("Subject name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.post("/grade-subjects", {
        name,
        code: newSubjectCode.trim() || null,
      });
      setNewSubjectName("");
      setNewSubjectCode("");
      try {
        await loadSubjects();
      } catch (reloadErr: unknown) {
        const reloadMsg = isAxiosError(reloadErr)
          ? String(reloadErr.response?.data?.message ?? reloadErr.message)
          : reloadErr instanceof Error
            ? reloadErr.message
            : "Unknown error";
        setError(`Subject was created, but the list could not be refreshed (${reloadMsg}). Try reloading the page.`);
      }
    } catch (err: unknown) {
      const message = isAxiosError(err)
        ? String(err.response?.data?.message ?? err.message)
        : err instanceof Error
          ? err.message
          : "Could not create grade subject.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const removeSubject = async (subjectId: string) => {
    if (!window.confirm("Delete this grade subject?")) return;
    setSaving(true);
    try {
      await apiClient.delete(`/grade-subjects/${subjectId}`);
      await loadSubjects();
    } catch {
      setError("Could not delete grade subject.");
    } finally {
      setSaving(false);
    }
  };

  const addRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) return;
    setSaving(true);
    setError(null);
    try {
      const grades: Record<string, number> = {};
      for (const k of addGradeKeys) {
        const raw = (addGradeValues[k] ?? "").trim();
        if (raw === "") continue;
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new Error(`Invalid score for "${k}".`);
        grades[k] = n;
      }
      const maxMerged: Record<string, number> = {};
      for (const k of addGradeKeys) {
        const raw = (addMaxValues[k] ?? "").trim();
        if (raw === "") continue;
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new Error(`Invalid max for "${k}".`);
        maxMerged[k] = n;
      }
      const maxScores = Object.keys(maxMerged).length > 0 ? maxMerged : undefined;
      await apiClient.post(`/grade-subjects/${selectedSubjectId}/records`, {
        studentName: recordName,
        studentNumber: recordNumber,
        email: recordEmail || null,
        ...(recordCode.trim() ? { code: recordCode.trim() } : {}),
        grades,
        maxScores,
      });
      setAddRecordOpen(false);
      await loadSubjectDetails(selectedSubjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add record.");
    } finally {
      setSaving(false);
    }
  };

  const openDeleteRecordConfirm = (record: GradeRecord) => {
    setDeleteRecordTarget(record);
    setDeleteRecordChallenge(generateDeleteRecordChallengeToken());
    setDeleteRecordChallengeInput("");
  };

  const closeDeleteRecordConfirm = () => {
    setDeleteRecordTarget(null);
    setDeleteRecordChallenge("");
    setDeleteRecordChallengeInput("");
  };

  const confirmDeleteRecord = async () => {
    if (!selectedSubjectId || !deleteRecordTarget) return;
    const typed = deleteRecordChallengeInput.trim().toUpperCase();
    if (typed !== deleteRecordChallenge) {
      toast.error("Type the confirmation code exactly to delete this record.");
      return;
    }
    const recordId = deleteRecordTarget.id;
    setSaving(true);
    try {
      await apiClient.delete(`/grade-subjects/${selectedSubjectId}/records/${recordId}`);
      closeDeleteRecordConfirm();
      setViewRecord((v) => (v?.id === recordId ? null : v));
      if (editingRecordId === recordId) cancelEditRecord();
      setSelectedRecordIds((prev) => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
      await loadSubjectDetails(selectedSubjectId);
      toast.success("Student record deleted.");
    } catch {
      setError("Could not delete grade record.");
      toast.error("Could not delete grade record.");
    } finally {
      setSaving(false);
    }
  };

  const openRegenerateCodeConfirm = (target: { id: string; studentName: string; studentNumber: string }) => {
    setRegenerateCodeTarget(target);
  };

  const closeRegenerateCodeConfirm = () => setRegenerateCodeTarget(null);

  const confirmRegenerateAccessCode = async () => {
    if (!selectedSubjectId || !regenerateCodeTarget) return;
    const recordId = regenerateCodeTarget.id;
    setSaving(true);
    try {
      const { data } = await apiClient.post<GradeRecord>(
        `/grade-subjects/${selectedSubjectId}/records/${recordId}/regenerate-code`
      );
      closeRegenerateCodeConfirm();
      setRecords((prev) => prev.map((r) => (r.id === recordId ? { ...r, ...data } : r)));
      setViewRecord((v) => (v?.id === recordId ? { ...v, ...data } : v));
      if (editingRecordId === recordId) setEditRecordCode(data.code);
      toast.success("Access code regenerated.");
    } catch {
      toast.error("Could not regenerate access code.");
    } finally {
      setSaving(false);
    }
  };

  const startEditRecord = (record: GradeRecord) => {
    setEditingRecordId(record.id);
    setEditRecordName(record.studentName);
    setEditRecordNumber(record.studentNumber);
    setEditRecordEmail(record.email ?? "");
    setEditRecordCode(record.code);
    const keys = mergeGradeKeysForEdit(record, gradeColumnKeys);
    setEditGradeKeys(keys);
    const gv: Record<string, string> = {};
    const mv: Record<string, string> = {};
    for (const k of keys) {
      const g = record.grades?.[k];
      gv[k] = g !== undefined && g !== null && Number.isFinite(Number(g)) ? String(g) : "";
      const m = record.maxScores?.[k];
      mv[k] = m !== undefined && m !== null && Number.isFinite(Number(m)) ? String(m) : "";
    }
    setEditGradeValues(gv);
    setEditMaxValues(mv);
    setEditNewGradeKey("");
  };

  const openEditRecord = (record: GradeRecord) => {
    setViewRecord(null);
    startEditRecord(record);
  };

  const cancelEditRecord = () => {
    setEditingRecordId(null);
    setEditRecordName("");
    setEditRecordNumber("");
    setEditRecordEmail("");
    setEditRecordCode("");
    setEditGradeKeys([]);
    setEditGradeValues({});
    setEditMaxValues({});
    setEditNewGradeKey("");
  };

  const appendEditGradeField = () => {
    const k = editNewGradeKey.trim();
    if (!k) return;
    if (editGradeKeys.includes(k)) {
      setError(`Column "${k}" is already in the list.`);
      return;
    }
    setError(null);
    setEditGradeKeys((prev) =>
      [...prev, k].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    );
    setEditGradeValues((prev) => ({ ...prev, [k]: "" }));
    setEditMaxValues((prev) => ({ ...prev, [k]: "" }));
    setEditNewGradeKey("");
  };

  const saveEditedRecord = async () => {
    if (!selectedSubjectId || !editingRecordId) return;
    setSaving(true);
    setError(null);
    try {
      const existing = records.find((r) => r.id === editingRecordId);
      if (!existing) throw new Error("Record not found.");

      const grades: Record<string, number> = { ...(existing.grades ?? {}) };
      for (const k of editGradeKeys) {
        const raw = (editGradeValues[k] ?? "").trim();
        if (raw === "") {
          delete grades[k];
        } else {
          const n = Number(raw);
          if (!Number.isFinite(n)) throw new Error(`Invalid score for "${k}".`);
          grades[k] = n;
        }
      }

      const maxMerged: Record<string, number> = { ...(existing.maxScores ?? {}) };
      for (const k of editGradeKeys) {
        const raw = (editMaxValues[k] ?? "").trim();
        if (raw === "") {
          delete maxMerged[k];
        } else {
          const n = Number(raw);
          if (!Number.isFinite(n)) throw new Error(`Invalid max for "${k}".`);
          maxMerged[k] = n;
        }
      }
      const maxScores = Object.keys(maxMerged).length > 0 ? maxMerged : null;

      await apiClient.patch(`/grade-subjects/${selectedSubjectId}/records/${editingRecordId}`, {
        studentName: editRecordName,
        studentNumber: editRecordNumber,
        email: editRecordEmail || null,
        code: editRecordCode,
        grades,
        maxScores,
      });
      await loadSubjectDetails(selectedSubjectId);
      cancelEditRecord();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update record.");
    } finally {
      setSaving(false);
    }
  };

  const importCsvRecords = async (file: File) => {
    if (!selectedSubjectId) return;
    if (
      !window.confirm(
        "Import replaces all grade records for this subject with the file contents (same as syncing from the source sheet). Continue?"
      )
    ) {
      return;
    }
    setSaving(true);
    setImportDialogError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await apiClient.post<{
        imported: number;
        removed: number;
        skipped: number;
        errors: string[];
      }>(`/grade-subjects/${selectedSubjectId}/records/import-csv`, formData);
      setImportPreviewCount(data.imported);
      await loadSubjectDetails(selectedSubjectId);
      setImportSummary({
        imported: data.imported,
        removed: data.removed ?? 0,
        skipped: data.skipped,
        errors: data.errors ?? [],
      });
    } catch (err) {
      const message = isAxiosError(err)
        ? String(err.response?.data?.message ?? err.message)
        : err instanceof Error
          ? err.message
          : "Could not import CSV.";
      setImportDialogError(message);
      setImportSummary(null);
    } finally {
      setSaving(false);
    }
  };

  const importFromGoogleSheet = async () => {
    if (!selectedSubjectId || !googleSheetUrl.trim()) return;
    if (
      !window.confirm(
        "Import replaces all grade records for this subject with the sheet contents (full sync). Continue?"
      )
    ) {
      return;
    }
    setSaving(true);
    setImportDialogError(null);
    try {
      const sheetUrl = googleSheetUrl.trim();
      const { data } = await apiClient.post<{
        imported: number;
        removed: number;
        skipped: number;
        errors: string[];
      }>(`/grade-subjects/${selectedSubjectId}/records/import-from-sheet`, { sheetUrl });
      persistImportSheetUrl(selectedSubjectId, sheetUrl);
      setGoogleSheetUrl(sheetUrl);
      setImportPreviewCount(data.imported);
      setImportSummary({
        imported: data.imported,
        removed: data.removed ?? 0,
        skipped: data.skipped,
        errors: data.errors ?? [],
      });
      await loadSubjectDetails(selectedSubjectId);
    } catch (err: unknown) {
      const message = isAxiosError(err)
        ? String(err.response?.data?.message ?? err.message)
        : err instanceof Error
          ? err.message
          : "Could not import from Google Sheet.";
      setImportDialogError(message);
      setImportSummary(null);
    } finally {
      setSaving(false);
    }
  };

  /** Excel upload uses multipart FormData; axios default JSON header would break the boundary, so we use fetch with the same base URL and Bearer token as the SPA. */
  const importExcelFile = async (file: File) => {
    if (!selectedSubjectId) return;
    if (
      !window.confirm(
        "Import replaces all grade records for this subject with the spreadsheet contents (full sync). Continue?"
      )
    ) {
      return;
    }
    setSaving(true);
    setImportDialogError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const apiBase = import.meta.env.VITE_API_URL ?? "/api";
      const token = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("accessToken") : null;
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/grade-subjects/${selectedSubjectId}/records/import-excel`, {
        method: "POST",
        credentials: "include",
        headers,
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        imported?: number;
        removed?: number;
        skipped?: number;
        errors?: string[];
      };
      if (!response.ok) {
        throw new Error(payload.message ?? `Import failed (${response.status})`);
      }
      const imported = payload.imported ?? 0;
      setImportPreviewCount(imported);
      setImportSummary({
        imported,
        removed: payload.removed ?? 0,
        skipped: payload.skipped ?? 0,
        errors: payload.errors ?? [],
      });
      await loadSubjectDetails(selectedSubjectId);
    } catch (err) {
      setImportDialogError(err instanceof Error ? err.message : "Could not import Excel file.");
      setImportSummary(null);
    } finally {
      setSaving(false);
    }
  };

  const downloadCsvTemplate = () => {
    const header = "studentName,studentNumber,email,Quiz 1,Midterms,Finals";
    /** Row 2 = maximum score per component; only columns with a positive number here are imported as grades. */
    const maxScoreRow = ",,,20,100,100";
    const sample = "Juan Dela Cruz,24-000001,juan@example.com,18,90,88";
    const sampleNoEmail = "Ana Reyes,25-000002,,15,85,80";
    const blob = new Blob([`${header}\n${maxScoreRow}\n${sample}\n${sampleNoEmail}\n`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "grade-records-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const addViewer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId || !candidateId) return;
    setSaving(true);
    try {
      await apiClient.put(`/grade-subjects/${selectedSubjectId}/viewers`, {
        userId: candidateId,
        canEdit: candidateCanEdit,
      });
      setCandidateId("");
      setCandidateCanEdit(false);
      await loadSubjectDetails(selectedSubjectId);
    } catch {
      setError("Could not update viewer.");
    } finally {
      setSaving(false);
    }
  };

  const removeViewer = async (userId: string) => {
    if (!selectedSubjectId) return;
    setSaving(true);
    try {
      await apiClient.delete(`/grade-subjects/${selectedSubjectId}/viewers/${userId}`);
      await loadSubjectDetails(selectedSubjectId);
    } catch {
      setError("Could not remove viewer.");
    } finally {
      setSaving(false);
    }
  };

  const computeGrades = async () => {
    if (!selectedSubjectId) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.post(`/grade-subjects/${selectedSubjectId}/compute-grades`);
      await loadSubjectDetails(selectedSubjectId);
    } catch (err) {
      const message = isAxiosError(err)
        ? String(err.response?.data?.message ?? err.message)
        : "Could not compute grades. Save a grading structure with at least one category first.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleRecordSelection = (recordId: string, checked: boolean) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(recordId);
      else next.delete(recordId);
      return next;
    });
  };

  const toggleAllRecordsSelection = (checked: boolean) => {
    if (!checked) {
      setSelectedRecordIds(new Set());
      return;
    }
    setSelectedRecordIds(new Set(filteredRecords.map((record) => record.id)));
  };

  const sendAccessEmails = async (selectedOnly: boolean): Promise<boolean> => {
    if (!selectedSubjectId) return false;
    setSaving(true);
    setError(null);
    try {
      const payload = selectedOnly ? { recordIds: Array.from(selectedRecordIds) } : {};
      await apiClient.post(`/grade-subjects/${selectedSubjectId}/send-access-codes`, payload);
      await loadSubjectDetails(selectedSubjectId);
      return true;
    } catch {
      setError("Could not send access code emails.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const sendAccessEmailOne = async (recordId: string) => {
    if (!selectedSubjectId) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await apiClient.post<{ sent: number; skipped: number }>(
        `/grade-subjects/${selectedSubjectId}/send-access-codes`,
        { recordIds: [recordId] }
      );
      await loadSubjectDetails(selectedSubjectId);
      if (data.sent > 0) toast.success("Access email sent.");
      else if (data.skipped > 0) toast.error("This record has no email address.");
      else toast.success("Nothing to send.");
    } catch {
      setError("Could not send access email.");
      toast.error("Could not send access email.");
    } finally {
      setSaving(false);
    }
  };

  const copyRecordLookupLink = async (record: GradeRecord) => {
    try {
      const url = `${window.location.origin}/grades?studentNumber=${encodeURIComponent(record.studentNumber)}&code=${encodeURIComponent(record.code)}`;
      await navigator.clipboard.writeText(url);
      toast.success("Public lookup link copied.");
    } catch {
      toast.error("Could not copy link.");
    }
  };

  const copyRecordAccessCode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("No access code to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(trimmed);
      toast.success("Access code copied.");
    } catch {
      toast.error("Could not copy access code.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Grades</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Manage grade subjects, records, grade computation, and sharing controls.
        </p>
      </div>

      {error && <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="space-y-3 rounded border border-border bg-surface p-4">
          <h2 className="text-lg font-medium text-foreground">Grade subjects</h2>
          <form className="space-y-2" onSubmit={createSubject}>
            <input
              className="w-full rounded border border-border-strong bg-background px-3 py-2 text-sm"
              placeholder="Subject name"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
            />
            <input
              className="w-full rounded border border-border-strong bg-background px-3 py-2 text-sm"
              placeholder="Code (optional)"
              value={newSubjectCode}
              onChange={(e) => setNewSubjectCode(e.target.value)}
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              Add subject
            </button>
          </form>

          <div className="space-y-2">
            {subjects.map((subject) => (
              <div
                key={subject.id}
                className={`w-full rounded border px-3 py-2 ${
                  selectedSubjectId === subject.id
                    ? "border-primary bg-primary-muted"
                    : "border-border bg-background hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSubjectId(subject.id)}
                    className="flex-1 text-left"
                  >
                    <span className="font-medium text-foreground">{subject.name}</span>
                  </button>
                  <span className="text-xs text-foreground-muted">{subject.code || "—"}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-foreground-muted">
                  <span>{subject._count.records} records</span>
                  <button
                    type="button"
                    className="text-danger"
                    onClick={() => void removeSubject(subject.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!loading && subjects.length === 0 && (
              <p className="text-sm text-foreground-muted">No grade subjects yet.</p>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded border border-border bg-surface p-4">
          {!selectedSubject ? (
            <p className="text-sm text-foreground-muted">Select a grade subject to manage records and sharing.</p>
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <h2 className="text-lg font-medium text-foreground">{selectedSubject.name}</h2>
                  <p className="text-xs text-foreground-muted">
                    Owner: {selectedSubject.owner.name} ({selectedSubject.owner.role})
                    <span aria-hidden> · </span>
                    <button
                      type="button"
                      onClick={() => setShareOpen(true)}
                      title="Open share access dialog"
                      aria-haspopup="dialog"
                      aria-expanded={shareOpen}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {viewers.length} shared viewer{viewers.length === 1 ? "" : "s"}
                    </button>
                  </p>
                </div>

                <div
                  role="toolbar"
                  aria-label="Grade subject actions"
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => void computeGrades()}
                    disabled={saving}
                    className="rounded border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
                  >
                    Compute grades
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddRecordOpen(true)}
                    disabled={saving}
                    className="rounded border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
                  >
                    Add record
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportOpen(true)}
                    disabled={saving}
                    className="rounded border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
                  >
                    Import data
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    disabled={saving}
                    className="rounded border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
                  >
                    Grading settings
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendEmailOpen(true)}
                    disabled={saving}
                    className="rounded border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
                  >
                    Send access emails
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    disabled={saving}
                    className="rounded border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
                  >
                    Share access ({viewers.length})
                  </button>
                </div>
              </div>

              <Dialog.Root
                open={addRecordOpen}
                onOpenChange={(open) => {
                  setAddRecordOpen(open);
                  if (open) {
                    initAddRecordGradeGrid();
                  } else {
                    setRecordName("");
                    setRecordNumber("");
                    setRecordEmail("");
                    setRecordCode("");
                    setAddGradeKeys([]);
                    setAddGradeValues({});
                    setAddMaxValues({});
                    setAddNewGradeKey("");
                  }
                }}
              >
                <Dialog.Content
                  title="Add record"
                  description="Create one row. Grade columns match the subject table; add more keys below if needed."
                  className="!max-w-2xl max-h-[90vh] overflow-y-auto"
                >
                  <form className="mt-4 space-y-4" onSubmit={addRecord}>
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="flex flex-col gap-0.5 text-xs font-medium text-foreground">
                        Name
                        <input
                          required
                          className="rounded border border-border-strong bg-background px-2 py-1.5 text-sm font-normal text-foreground"
                          value={recordName}
                          onChange={(e) => setRecordName(e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs font-medium text-foreground">
                        Student number
                        <input
                          required
                          className="rounded border border-border-strong bg-background px-2 py-1.5 text-sm font-normal text-foreground"
                          value={recordNumber}
                          onChange={(e) => setRecordNumber(e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs font-medium text-foreground">
                        Email
                        <input
                          className="rounded border border-border-strong bg-background px-2 py-1.5 text-sm font-normal text-foreground"
                          type="email"
                          value={recordEmail}
                          onChange={(e) => setRecordEmail(e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs font-medium text-foreground">
                        Access code
                        <input
                          className="rounded border border-border-strong bg-background px-2 py-1.5 text-sm font-normal font-mono text-foreground"
                          placeholder="Leave blank to auto-generate"
                          value={recordCode}
                          onChange={(e) => setRecordCode(e.target.value)}
                        />
                        <span className="text-[11px] font-normal text-foreground-muted">
                          Optional. Empty field lets the server assign a unique access code.
                        </span>
                      </label>
                    </div>
                    <RecordGradeGridEditor
                      gradeKeys={addGradeKeys}
                      gradeValues={addGradeValues}
                      maxValues={addMaxValues}
                      newKeyInput={addNewGradeKey}
                      onNewKeyInputChange={setAddNewGradeKey}
                      onGradeChange={(key, value) =>
                        setAddGradeValues((prev) => ({ ...prev, [key]: value }))
                      }
                      onMaxChange={(key, value) => setAddMaxValues((prev) => ({ ...prev, [key]: value }))}
                      onAppendColumn={() => appendAddGradeField()}
                    />
                    <div className="flex justify-end gap-2 pt-2">
                      <Dialog.Close asChild>
                        <button
                          type="button"
                          className="rounded border border-border-strong bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover"
                        >
                          Cancel
                        </button>
                      </Dialog.Close>
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                      >
                        Create record
                      </button>
                    </div>
                  </form>
                </Dialog.Content>
              </Dialog.Root>

              <Dialog.Root
                open={importOpen}
                onOpenChange={(open) => {
                  setImportOpen(open);
                  if (open) setImportDialogError(null);
                }}
              >
                <Dialog.Content
                  title="Import records"
                  description="**Full replace:** existing records for this subject are removed, then data is loaded from your file or sheet (re-import = sync from source, not append). Row 1: headers. Row 2: max score per component (positive number). Row 3+: student rows — **blank / - / N/A** score cells are left empty (not 0) so status reflects true completeness. Optional email / access `code`. **Course**, **Remarks**, **Final grade** / computed total columns (not **Final Exam** scores) are ignored. Put a positive max in row 2 under **Final Exam** so that column imports. `*_max` columns optional — maxima come from row 2."
                  className="!max-w-xl max-h-[90vh] overflow-y-auto"
                >
                  <div className="mt-4 space-y-3 text-sm">
                    {importDialogError && (
                      <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                        {importDialogError}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={downloadCsvTemplate}
                      className="rounded border border-border-strong bg-background px-3 py-1.5 text-xs hover:bg-surface-hover"
                    >
                      Download CSV template
                    </button>
                    <div>
                      <p className="mb-1 text-xs font-medium text-foreground-muted">CSV file</p>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void importCsvRecords(file);
                        }}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-foreground-muted">Google Sheet URL</p>
                      <p className="mb-1 text-xs text-foreground-muted">
                        Sheet must be viewable by anyone with the link. After a successful import, this URL is remembered for
                        this subject on this browser.
                      </p>
                      <input
                        className="mb-2 w-full rounded border border-border-strong px-2 py-1.5 text-xs"
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        value={googleSheetUrl}
                        onChange={(e) => setGoogleSheetUrl(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={!googleSheetUrl.trim() || saving}
                        onClick={() => void importFromGoogleSheet()}
                        className="rounded border border-border-strong bg-background px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-50"
                      >
                        Import/Update from sheet
                      </button>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-foreground-muted">Excel (.xlsx)</p>
                      <input
                        type="file"
                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void importExcelFile(file);
                          e.target.value = "";
                        }}
                        className="text-xs"
                      />
                    </div>
                    {importPreviewCount > 0 && (
                      <p className="text-xs text-foreground-muted">Last import row count: {importPreviewCount}</p>
                    )}
                    {importSummary && (
                      <div className="rounded border border-border px-2 py-2 text-xs">
                        <p className="text-foreground-muted">
                          Removed (previous rows): {importSummary.removed} • Imported: {importSummary.imported} • Skipped
                          rows (warnings): {importSummary.skipped}
                        </p>
                        {importSummary.errors.length > 0 && (
                          <div className="mt-1 rounded border border-warning/30 bg-warning/10 p-2 text-warning">
                            {importSummary.errors.slice(0, 5).map((msg, idx) => (
                              <p key={`${idx}-${msg}`}>{msg}</p>
                            ))}
                            {importSummary.errors.length > 5 && <p>...and {importSummary.errors.length - 5} more</p>}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end pt-2">
                      <Dialog.Close asChild>
                        <button type="button" className="rounded border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-hover">
                          Close
                        </button>
                      </Dialog.Close>
                    </div>
                  </div>
                </Dialog.Content>
              </Dialog.Root>

              <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
                <Dialog.Content title="Grading settings" className="!max-w-3xl w-[min(48rem,95vw)] max-h-[90vh] overflow-y-auto">
                  {selectedSubjectId && selectedSubject && (
                    <>
                      <div className="mt-4">
                        <GradingSystemSettingsPanel
                          key={selectedSubjectId}
                          subjectId={selectedSubjectId}
                          initialGradingSystem={selectedSubject.gradingSystem ?? null}
                          gradingSystemSnapshot={gradingSystemSnapshot}
                          initialStudentComputeEnabled={selectedSubject.studentComputeEnabled}
                          records={records}
                          saving={saving}
                          embedInDialog
                          settingsOpen={settingsOpen}
                          onBusyChange={setSaving}
                          onSaved={async (updated) => {
                            if (updated?.id === selectedSubjectId) {
                              setSubjects((prev) =>
                                prev.map((s) =>
                                  s.id === updated.id ? ({ ...s, ...updated } as GradeSubject) : s
                                )
                              );
                            }
                            await loadSubjects();
                            await loadSubjectDetails(selectedSubjectId);
                          }}
                        />
                      </div>
                      <div className="mt-6 flex justify-end border-t border-border pt-4">
                        <Dialog.Close asChild>
                          <button
                            type="button"
                            className="rounded border border-border-strong bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
                          >
                            Close
                          </button>
                        </Dialog.Close>
                      </div>
                    </>
                  )}
                </Dialog.Content>
              </Dialog.Root>

              <Dialog.Root open={sendEmailOpen} onOpenChange={setSendEmailOpen}>
                <Dialog.Content
                  title="Send access emails"
                  description="Emails include the public grade link and access code. Records without an email are skipped."
                  className="!max-w-md"
                >
                  <p className="mt-3 text-sm text-foreground-muted">
                    Selected in table: <span className="font-medium text-foreground">{selectedRecordIds.size}</span> record
                    {selectedRecordIds.size === 1 ? "" : "s"}
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Dialog.Close asChild>
                      <button type="button" className="rounded border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-hover">
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={async () => {
                        if (await sendAccessEmails(false)) setSendEmailOpen(false);
                      }}
                      className="rounded border border-border-strong bg-background px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-50"
                    >
                      Send to all records
                    </button>
                    <button
                      type="button"
                      disabled={saving || selectedRecordIds.size === 0}
                      onClick={async () => {
                        if (await sendAccessEmails(true)) setSendEmailOpen(false);
                      }}
                      className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      Send to selected only
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Root>

              <Dialog.Root open={shareOpen} onOpenChange={setShareOpen}>
                <Dialog.Content title="Share access" description="Invite staff to view or edit this grade subject." className="!max-w-lg max-h-[90vh] overflow-y-auto">
                  <form className="mt-4 mb-3 flex flex-wrap gap-2" onSubmit={addViewer}>
                    <select
                      className="min-w-[200px] flex-1 rounded border border-border-strong bg-background px-2 py-1.5 text-sm"
                      value={candidateId}
                      onChange={(e) => setCandidateId(e.target.value)}
                    >
                      <option value="">Select user</option>
                      {viewerCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name} ({candidate.role})
                        </option>
                      ))}
                    </select>
                    <label className="inline-flex items-center gap-1 text-xs text-foreground-muted">
                      <input type="checkbox" checked={candidateCanEdit} onChange={(e) => setCandidateCanEdit(e.target.checked)} />
                      can edit
                    </label>
                    <button type="submit" className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                      Add viewer
                    </button>
                  </form>
                  <div className="max-h-[40vh] space-y-1 overflow-y-auto">
                    {viewers.map((viewer) => (
                      <div key={viewer.userId} className="flex items-center justify-between rounded border border-border px-2 py-1.5">
                        <span className="text-sm text-foreground">
                          {viewer.user.name} ({viewer.user.role}) {viewer.canEdit ? "• edit" : "• view"}
                        </span>
                        <button type="button" className="text-xs text-danger" onClick={() => void removeViewer(viewer.userId)}>
                          Remove
                        </button>
                      </div>
                    ))}
                    {viewers.length === 0 && <p className="text-xs text-foreground-muted">No viewers yet.</p>}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Dialog.Close asChild>
                      <button type="button" className="rounded border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-hover">
                        Done
                      </button>
                    </Dialog.Close>
                  </div>
                </Dialog.Content>
              </Dialog.Root>

              <Dialog.Root open={editingRecordId !== null} onOpenChange={(open) => !open && cancelEditRecord()}>
                <Dialog.Content
                  title="Edit record"
                  description="Update identity, scores, and optional per-column maxima (empty max defaults to 100 for ratios)."
                  className="!max-w-2xl max-h-[90vh] overflow-y-auto"
                >
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="flex flex-col gap-0.5 text-xs font-medium text-foreground">
                        Name
                        <input
                          className="rounded border border-border-strong bg-background px-2 py-1.5 text-sm font-normal text-foreground"
                          value={editRecordName}
                          onChange={(e) => setEditRecordName(e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs font-medium text-foreground">
                        Student number
                        <input
                          className="rounded border border-border-strong bg-background px-2 py-1.5 text-sm font-normal text-foreground"
                          value={editRecordNumber}
                          onChange={(e) => setEditRecordNumber(e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs font-medium text-foreground">
                        Email
                        <input
                          className="rounded border border-border-strong bg-background px-2 py-1.5 text-sm font-normal text-foreground"
                          type="email"
                          value={editRecordEmail}
                          onChange={(e) => setEditRecordEmail(e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs font-medium text-foreground">
                        Access code
                        <input
                          className="rounded border border-border-strong bg-background px-2 py-1.5 text-sm font-normal text-foreground font-mono"
                          value={editRecordCode}
                          onChange={(e) => setEditRecordCode(e.target.value)}
                        />
                        {editingRecordId && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void copyRecordAccessCode(editRecordCode)}
                              className="inline-flex items-center gap-1 rounded border border-border-strong px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface-hover disabled:opacity-50"
                            >
                              <Copy className="h-3 w-3" aria-hidden />
                              Copy code
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                openRegenerateCodeConfirm({
                                  id: editingRecordId,
                                  studentName: editRecordName,
                                  studentNumber: editRecordNumber,
                                })
                              }
                              className="rounded border border-border-strong px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface-hover disabled:opacity-50"
                            >
                              Generate new code
                            </button>
                          </div>
                        )}
                      </label>
                    </div>

                    <RecordGradeGridEditor
                      gradeKeys={editGradeKeys}
                      gradeValues={editGradeValues}
                      maxValues={editMaxValues}
                      newKeyInput={editNewGradeKey}
                      onNewKeyInputChange={setEditNewGradeKey}
                      onGradeChange={(key, value) =>
                        setEditGradeValues((prev) => ({ ...prev, [key]: value }))
                      }
                      onMaxChange={(key, value) => setEditMaxValues((prev) => ({ ...prev, [key]: value }))}
                      onAppendColumn={() => appendEditGradeField()}
                    />
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="rounded border border-border-strong bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover"
                      >
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveEditedRecord()}
                      className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      Save record
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Root>

              <Dialog.Root open={viewRecord !== null} onOpenChange={(open) => !open && setViewRecord(null)}>
                <Dialog.Content
                  title="Record details"
                  description="Raw scores, maxima, and computed grade for this row."
                  className="!max-w-lg max-h-[90vh] overflow-y-auto"
                >
                  {viewRecord && (
                    <div className="mt-4 space-y-4 text-sm">
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        <dt className="text-foreground-muted">Student</dt>
                        <dd className="text-foreground">{viewRecord.studentName}</dd>
                        <dt className="text-foreground-muted">Number</dt>
                        <dd className="font-mono text-foreground">{viewRecord.studentNumber}</dd>
                        <dt className="text-foreground-muted">Email</dt>
                        <dd className="break-all text-foreground">{viewRecord.email ?? "—"}</dd>
                        <dt className="text-foreground-muted">Code</dt>
                        <dd className="flex flex-wrap items-center gap-2 font-mono text-foreground">
                          <button
                            type="button"
                            className="rounded px-1 py-0.5 text-left hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            title="Copy access code"
                            onClick={() => void copyRecordAccessCode(viewRecord.code)}
                          >
                            {viewRecord.code}
                          </button>
                          <button
                            type="button"
                            title="Copy access code"
                            disabled={saving}
                            onClick={() => void copyRecordAccessCode(viewRecord.code)}
                            className="rounded border border-border-strong p-1 text-foreground hover:bg-surface-hover disabled:opacity-50"
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                            <span className="sr-only">Copy access code</span>
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              openRegenerateCodeConfirm({
                                id: viewRecord.id,
                                studentName: viewRecord.studentName,
                                studentNumber: viewRecord.studentNumber,
                              })
                            }
                            className="rounded border border-border-strong px-2 py-0.5 text-[11px] font-sans font-medium text-foreground hover:bg-surface-hover disabled:opacity-50"
                          >
                            New code
                          </button>
                        </dd>
                        <dt className="text-foreground-muted">Entry status</dt>
                        <dd className="text-foreground">
                          {(() => {
                            const c = getRecordCompletion(viewRecord, expectedKeysForCompletion);
                            if (c.status === "na") return "—";
                            return (
                              <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${completionBadgeClasses(c.status)}`}>
                                {completionLabel(c.status)} ({`${c.filled}/${c.total}`})
                              </span>
                            );
                          })()}
                        </dd>
                        <dt className="text-foreground-muted">Final</dt>
                        <dd className={finalGradeClassName(viewRecord, "inline")}>
                          <div className="flex flex-col gap-0.5">
                            <span>{viewRecord.computedGrade?.finalGrade ?? "—"}</span>
                            {(viewRecord.computedGrade?.remarks || viewRecord.computedGrade?.letterGrade) && (
                              <span className="text-xs font-semibold text-inherit">
                                {viewRecord.computedGrade?.remarks
                                  ? viewRecord.computedGrade?.letterGrade
                                    ? `${viewRecord.computedGrade.remarks} · ${viewRecord.computedGrade.letterGrade}`
                                    : viewRecord.computedGrade.remarks
                                  : viewRecord.computedGrade?.letterGrade}
                              </span>
                            )}
                            {viewRecord.computedGrade?.passed !== null &&
                              viewRecord.computedGrade?.passed !== undefined &&
                              !isStructuredOutcomeRemark(viewRecord.computedGrade?.remarks) && (
                                <span className="text-xs font-medium text-inherit opacity-90">
                                  {viewRecord.computedGrade.passed ? "Pass" : "Fail"}
                                  {viewRecord.computedGrade.passingGrade != null
                                    ? ` (passing ${viewRecord.computedGrade.passingGrade}%)`
                                    : ""}
                                </span>
                              )}
                          </div>
                        </dd>
                      </dl>
                      <p className="text-[10px] leading-snug text-foreground-muted">
                        Score highlights vs column max (default 100): green ≥ passing {passingPercentForHighlights}% from
                        settings, amber within {NEAR_PASSING_BAND_POINTS} points below, red lower. Final shading uses
                        equivalence remarks / pass-fail.
                      </p>
                      <div>
                        <p className="mb-2 text-xs font-medium text-foreground-muted">Scores</p>
                        <table className="w-full border border-border text-xs">
                          <thead>
                            <tr className="bg-surface-muted">
                              <th className="px-2 py-1 text-left">Component</th>
                              <th className="px-2 py-1 text-center">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.keys(viewRecord.grades ?? {}).map((key) => (
                              <tr key={key} className="border-t border-border">
                                <td className="px-2 py-1 text-foreground">{key}</td>
                                <td className={gradeCellClassName(viewRecord, key, passingPercentForHighlights)}>
                                  {formatGradeCell(viewRecord, key)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {viewRecord.computedGrade != null && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-foreground-muted">Computed grade details</p>
                          <div className="rounded border border-border bg-background p-2">
                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                              <dt className="text-foreground-muted">Final grade</dt>
                              <dd className="font-medium text-foreground">
                                {viewRecord.computedGrade.finalGrade ?? "—"}
                              </dd>
                              <dt className="text-foreground-muted">Equivalent</dt>
                              <dd className="text-foreground">
                                {viewRecord.computedGrade.letterGrade ?? "—"}
                              </dd>
                              <dt className="text-foreground-muted">Remarks</dt>
                              <dd className="text-foreground">
                                {viewRecord.computedGrade.remarks ?? "—"}
                              </dd>
                              <dt className="text-foreground-muted">Passed</dt>
                              <dd className="text-foreground">
                                {viewRecord.computedGrade.passed == null ? "—" : viewRecord.computedGrade.passed ? "Yes" : "No"}
                              </dd>
                              <dt className="text-foreground-muted">Passing grade</dt>
                              <dd className="text-foreground">
                                {viewRecord.computedGrade.passingGrade ?? "—"}
                              </dd>
                              <dt className="text-foreground-muted">Computed at</dt>
                              <dd className="text-foreground">
                                {viewRecord.computedGrade.computedAt
                                  ? new Date(viewRecord.computedGrade.computedAt).toLocaleString()
                                  : "—"}
                              </dd>
                            </dl>
                            <ComputedBreakdownSection breakdown={viewRecord.computedGrade.breakdown} />
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap justify-end gap-2">
                        <Dialog.Close asChild>
                          <button type="button" className="rounded border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-hover">
                            Close
                          </button>
                        </Dialog.Close>
                        <button
                          type="button"
                          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                          onClick={() => {
                            if (!viewRecord) return;
                            openEditRecord(viewRecord);
                          }}
                        >
                          Edit record
                        </button>
                      </div>
                    </div>
                  )}
                </Dialog.Content>
              </Dialog.Root>

              <Dialog.Root
                open={regenerateCodeTarget !== null}
                onOpenChange={(open) => {
                  if (!open) closeRegenerateCodeConfirm();
                }}
              >
                <Dialog.Content
                  title="Generate new access code?"
                  description="Old public links and emails that used the previous code will stop working. Students will need the new code to look up grades."
                  className="!max-w-md"
                >
                  {regenerateCodeTarget && (
                    <div className="mt-4 space-y-3 text-sm">
                      <p className="rounded border border-border bg-background px-3 py-2 text-foreground">
                        <span className="text-foreground-muted">Student: </span>
                        <span className="font-medium">{regenerateCodeTarget.studentName}</span>
                        <span className="text-foreground-muted"> · #</span>
                        <span className="font-mono">{regenerateCodeTarget.studentNumber}</span>
                      </p>
                      <div className="flex flex-wrap justify-end gap-2 pt-2">
                        <Dialog.Close asChild>
                          <button
                            type="button"
                            className="rounded border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-hover"
                            disabled={saving}
                          >
                            Cancel
                          </button>
                        </Dialog.Close>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void confirmRegenerateAccessCode()}
                          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                        >
                          Generate new code
                        </button>
                      </div>
                    </div>
                  )}
                </Dialog.Content>
              </Dialog.Root>

              <Dialog.Root
                open={deleteRecordTarget !== null}
                onOpenChange={(open) => {
                  if (!open) closeDeleteRecordConfirm();
                }}
              >
                <Dialog.Content
                  title="Delete student record?"
                  description="This removes the row and its grades from this subject. Public lookup for this student’s code will stop working."
                  className="!max-w-md"
                >
                  {deleteRecordTarget && (
                    <div className="mt-4 space-y-3 text-sm">
                      <p className="rounded border border-border bg-background px-3 py-2 text-foreground">
                        <span className="text-foreground-muted">Student: </span>
                        <span className="font-medium">{deleteRecordTarget.studentName}</span>
                        <span className="text-foreground-muted"> · #</span>
                        <span className="font-mono">{deleteRecordTarget.studentNumber}</span>
                      </p>
                      <p className="text-xs text-foreground-muted">
                        To confirm, type the code below (letters are accepted in any case). A new code is shown each time you
                        open this dialog.
                      </p>
                      <p
                        className="select-all rounded border border-dashed border-border-strong bg-surface-muted px-3 py-2 text-center font-mono text-lg font-semibold tracking-widest text-foreground"
                        aria-live="polite"
                      >
                        {deleteRecordChallenge}
                      </p>
                      <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                        Confirmation code
                        <input
                          type="text"
                          autoComplete="off"
                          spellCheck={false}
                          value={deleteRecordChallengeInput}
                          onChange={(e) => setDeleteRecordChallengeInput(e.target.value.toUpperCase())}
                          className="rounded border border-border-strong bg-background px-3 py-2 font-mono text-sm uppercase tracking-wide text-foreground"
                          placeholder="Type the code"
                        />
                      </label>
                      <div className="flex flex-wrap justify-end gap-2 pt-2">
                        <Dialog.Close asChild>
                          <button
                            type="button"
                            className="rounded border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-hover"
                            disabled={saving}
                          >
                            Cancel
                          </button>
                        </Dialog.Close>
                        <button
                          type="button"
                          className="rounded bg-danger px-3 py-1.5 text-sm font-medium text-danger-foreground disabled:opacity-50"
                          disabled={
                            saving ||
                            deleteRecordChallenge.length === 0 ||
                            deleteRecordChallengeInput.trim().toUpperCase() !== deleteRecordChallenge
                          }
                          onClick={() => void confirmDeleteRecord()}
                        >
                          Delete record
                        </button>
                      </div>
                    </div>
                  )}
                </Dialog.Content>
              </Dialog.Root>

              <p className="text-[10px] text-foreground-muted">
                Score cells vs each column&apos;s max (default 100): green ≥ passing {passingPercentForHighlights}% (grading
                settings), amber within {NEAR_PASSING_BAND_POINTS} points below, red lower. Final column uses equivalence
                remarks / pass-fail. Status = required keys filled (formula or visible columns).
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                  placeholder="Search: name, number, email, code, grades, final, remarks…"
                  className="w-full max-w-md rounded border border-border-strong bg-background px-3 py-1.5 text-sm text-foreground"
                />
                <p className="text-xs text-foreground-muted">
                  Showing {filteredRecords.length} of {records.length}
                </p>
              </div>
              <div className="overflow-x-auto rounded border border-border">
                <table className="min-w-max w-full table-fixed border-separate border-spacing-0 text-sm">
                  <thead className="bg-surface-muted text-left">
                    <tr>
                      <th className="sticky left-0 z-[4] box-border w-10 min-w-10 bg-surface-muted px-2 py-2 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                        <input
                          type="checkbox"
                          checked={filteredRecords.length > 0 && filteredRecords.every((r) => selectedRecordIds.has(r.id))}
                          onChange={(e) => toggleAllRecordsSelection(e.target.checked)}
                          aria-label="Select all records"
                        />
                      </th>
                      <th className="sticky left-10 z-[3] box-border w-44 min-w-44 whitespace-nowrap bg-surface-muted px-3 py-2 overflow-hidden text-ellipsis">
                        Student
                      </th>
                      <th className="sticky left-[13.5rem] z-[3] box-border w-32 min-w-32 whitespace-nowrap bg-surface-muted px-3 py-2 overflow-hidden text-ellipsis">
                        Number
                      </th>
                      <th className="sticky left-[21.5rem] z-[3] box-border w-52 min-w-52 whitespace-nowrap bg-surface-muted px-3 py-2 overflow-hidden text-ellipsis">
                        Email
                      </th>
                      <th
                        className="sticky left-[34.5rem] z-[3] box-border w-24 min-w-24 whitespace-nowrap bg-surface-muted px-2 py-2 overflow-hidden text-ellipsis"
                        title="Access code — click a cell below to copy"
                      >
                        Code
                      </th>
                      {gradeColumnKeys.map((key, idx) => (
                        <th
                          key={key}
                          className={`box-border max-w-[10rem] min-w-[4.5rem] whitespace-nowrap px-2 py-2 text-center font-medium text-foreground ${idx === 0 ? "border-l border-border" : ""}`}
                          title={key}
                        >
                          <span className="block truncate">{key}</span>
                        </th>
                      ))}
                      <th
                        aria-hidden
                        className="box-border w-0 min-w-0 bg-surface-muted p-0"
                      />
                      <th
                        className="sticky right-[15rem] z-[3] box-border w-24 min-w-24 whitespace-nowrap border-l border-border bg-surface-muted pl-3 pr-1 py-2 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                        title="Filled grade keys vs grading formula (or visible columns)"
                      >
                        Status
                      </th>
                      <th className="sticky right-40 z-[3] box-border w-22 min-w-20 whitespace-nowrap bg-surface-muted px-2 py-2 overflow-hidden text-ellipsis">
                        Final
                      </th>
                      <th className="sticky right-0 z-[4] box-border w-42 min-w-42 bg-surface-muted px-2 py-2 text-right font-medium text-foreground shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((record) => (
                      <tr key={record.id} className="border-t border-border">
                        <td className="sticky left-0 z-[2] box-border w-10 min-w-10 bg-background px-2 py-2 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                          <input
                            type="checkbox"
                            checked={selectedRecordIds.has(record.id)}
                            onChange={(e) => toggleRecordSelection(record.id, e.target.checked)}
                            aria-label={`Select ${record.studentName}`}
                          />
                        </td>
                        <td className="sticky left-10 z-[1] box-border w-44 min-w-44 whitespace-nowrap bg-background px-3 py-2 text-foreground">
                          <div className="truncate" title={record.studentName}>
                            {record.studentName}
                          </div>
                        </td>
                        <td className="sticky left-[13.5rem] z-[1] box-border w-32 min-w-32 whitespace-nowrap bg-background px-3 py-2 font-mono text-xs text-foreground">
                          <div className="truncate" title={record.studentNumber}>
                            {record.studentNumber}
                          </div>
                        </td>
                        <td className="sticky left-[21.5rem] z-[1] box-border w-52 min-w-52 bg-background px-3 py-2 text-xs text-foreground">
                          <div className="truncate" title={record.email ?? undefined}>
                            {record.email ?? "—"}
                          </div>
                          {record.email && record.emailSentAt && (
                            <div className="mt-0.5 text-[10px] text-foreground-muted">Sent {shortSentAt(record.emailSentAt) ?? ""}</div>
                          )}
                        </td>
                        <td className="sticky left-[34.5rem] z-[1] box-border w-24 min-w-24 whitespace-nowrap bg-background px-1 py-1 font-mono text-xs text-foreground align-middle">
                          <button
                            type="button"
                            className="block max-w-full truncate rounded px-1 py-1 text-left hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            title="Copy access code"
                            onClick={() => void copyRecordAccessCode(record.code)}
                          >
                            {record.code}
                          </button>
                        </td>
                        {gradeColumnKeys.map((key, idx) => (
                          <td
                            key={`${record.id}-${key}`}
                            className={`${gradeCellClassName(record, key, passingPercentForHighlights)} ${idx === 0 ? "border-l border-border" : ""}`}
                          >
                            {formatGradeCell(record, key)}
                          </td>
                        ))}
                        <td aria-hidden className="w-2 min-w-2 bg-background p-0" />
                        <td className="sticky right-[15rem] z-[1] box-border w-24 min-w-24 border-l border-border bg-background pl-3 pr-1 py-2 align-top shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                          {(() => {
                            const c = getRecordCompletion(record, expectedKeysForCompletion);
                            if (c.status === "na") {
                              return <span className="text-xs text-foreground-muted">—</span>;
                            }
                            return (
                              <div
                                className="flex flex-col gap-1"
                                title={
                                  c.missingKeys.length > 0
                                    ? `Missing: ${c.missingKeys.join(", ")}`
                                    : "All required grade fields have values"
                                }
                              >
                                <span
                                  className={`inline-flex w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${completionBadgeClasses(c.status)}`}
                                >
                                  {completionLabel(c.status)}
                                </span>
                                <span className="text-[10px] tabular-nums text-foreground-muted">
                                  {`${c.filled}/${c.total}`}
                                </span>
                                <div
                                  className="h-1.5 w-full max-w-[4.5rem] overflow-hidden rounded-full bg-border"
                                  role="progressbar"
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={c.pct}
                                  aria-label={`Grade entry ${c.pct} percent complete`}
                                >
                                  <div
                                    className={`h-full rounded-full transition-[width] ${
                                      c.status === "complete"
                                        ? "bg-success"
                                        : c.status === "partial"
                                          ? "bg-warning"
                                          : "bg-foreground-muted/40"
                                    }`}
                                    style={{ width: `${c.pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className={`sticky right-40 z-[1] box-border w-24 min-w-24 align-top ${finalGradeClassName(record)}`}>
                          <div className="flex flex-col gap-0.5">
                            <span>{record.computedGrade?.finalGrade ?? "—"}</span>
                            {(record.computedGrade?.remarks || record.computedGrade?.letterGrade) && (
                              <span className="text-[10px] font-semibold text-inherit">
                                {record.computedGrade?.remarks
                                  ? record.computedGrade?.letterGrade
                                    ? `${record.computedGrade.remarks} · ${record.computedGrade.letterGrade}`
                                    : record.computedGrade.remarks
                                  : record.computedGrade?.letterGrade}
                              </span>
                            )}
                            {record.computedGrade?.passed !== null &&
                              record.computedGrade?.passed !== undefined &&
                              !isStructuredOutcomeRemark(record.computedGrade?.remarks) && (
                                <span className="text-[10px] font-medium text-inherit opacity-90">
                                  {record.computedGrade.passed ? "Pass" : "Fail"}
                                </span>
                              )}
                          </div>
                        </td>
                        <td className="sticky right-0 z-[2] box-border w-44 min-w-44 bg-background px-1 py-1 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                          <div className="flex flex-wrap items-center justify-end gap-0.5">
                            <button
                              type="button"
                              title="View details"
                              aria-label="View details"
                              className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                              onClick={() => setViewRecord(record)}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Send access email"
                              aria-label="Send access email"
                              disabled={saving}
                              className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
                              onClick={() => void sendAccessEmailOne(record.id)}
                            >
                              <Mail className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Copy public lookup link"
                              aria-label="Copy public lookup link"
                              className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                              onClick={() => void copyRecordLookupLink(record)}
                            >
                              <Link2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Copy access code"
                              aria-label="Copy access code"
                              className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                              onClick={() => void copyRecordAccessCode(record.code)}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Regenerate access code"
                              aria-label="Regenerate access code"
                              disabled={saving}
                              className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
                              onClick={() =>
                                openRegenerateCodeConfirm({
                                  id: record.id,
                                  studentName: record.studentName,
                                  studentNumber: record.studentNumber,
                                })
                              }
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Edit record"
                              aria-label="Edit record"
                              className="rounded p-1.5 text-primary hover:bg-primary-muted"
                              onClick={() => openEditRecord(record)}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Delete record"
                              aria-label="Delete record"
                              className="rounded p-1.5 text-danger hover:bg-danger/10"
                              onClick={() => openDeleteRecordConfirm(record)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredRecords.length === 0 && (
                      <tr>
                        <td className="px-3 py-3 text-foreground-muted" colSpan={recordTableColCount}>
                          {recordSearch.trim() ? "No records match your search." : "No records yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

