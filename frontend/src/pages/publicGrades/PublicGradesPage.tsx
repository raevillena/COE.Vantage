import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SEMESTER_LABEL,
  compareTermsNewestFirst,
  distinctTerms,
  latestTerm,
  termKey,
  termLabel,
  type GradeTerm,
} from "../../utils/gradeTerm";

type PublicRecord = {
  id: string;
  studentName: string;
  studentNumber: string;
  code: string;
  grades: Record<string, number>;
  /** The most each item could score; an item without one is shown as its score alone. */
  maxScores?: Record<string, number> | null;
  /** Every item the subject expects, in the grading formula's order: includes the ones this student has no score for. */
  items?: string[];
  /** The subject's term is a college's Current Semester: the lookup opens on it. */
  isCurrentTerm?: boolean;
  computedGrade?: {
    /** null when the grade is INC: an item has no score yet. */
    finalGrade?: number | null;
    incomplete?: boolean;
    letterGrade?: string | null;
    remarks?: string | null;
    passed?: boolean | null;
  } | null;
  subject: {
    id: string;
    name: string;
    code?: string | null;
    studentComputeEnabled?: boolean;
    semester?: number | null;
    academicYear?: { id: string; name: string } | null;
  };
};

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

const ALL = "all";
const NO_YEAR = "none";
const NO_SEMESTER = "unset";

const termOf = (record: PublicRecord): GradeTerm => ({
  yearId: record.subject.academicYear?.id ?? null,
  yearName: record.subject.academicYear?.name ?? null,
  semester: record.subject.semester ?? null,
});

const semesterValue = (semester: number | null) => (semester === null ? NO_SEMESTER : String(semester));

const selectClass = "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1";
const inputClass = "rounded-md border border-border-strong bg-surface px-3 py-2.5 text-base font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 sm:text-sm";

export function PublicGradesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [studentNumber, setStudentNumber] = useState("");
  const [code, setCode] = useState("");
  const [records, setRecords] = useState<PublicRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [computingRecordId, setComputingRecordId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** True after we finished a lookup (including empty results), so we can message "no match" vs "not loaded yet". */
  const [hasSearched, setHasSearched] = useState(false);
  const [yearFilter, setYearFilter] = useState(ALL);
  const [semesterFilter, setSemesterFilter] = useState(ALL);

  const runLookup = useCallback(async (sn: string, cd: string) => {
    const trimmedSn = sn.trim();
    const trimmedCd = cd.trim();
    if (!trimmedSn || !trimmedCd) {
      setError("Student number and access code are required.");
      setRecords([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ studentNumber: trimmedSn, code: trimmedCd });
      const response = await fetch(`${API_BASE}/grade-subjects/public/records?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message || "Lookup failed");
      }
      const data = (await response.json()) as PublicRecord[];
      setRecords(data);
      // Open on the Current Semester when the student has grades in it, otherwise on the latest semester that has grades;
      // a student with no dated subjects sees everything.
      const now = data.find((record) => record.isCurrentTerm && record.subject.academicYear);
      const latest = now ? termOf(now) : latestTerm(data.map(termOf));
      setYearFilter(latest?.yearId ?? ALL);
      setSemesterFilter(latest ? semesterValue(latest.semester) : ALL);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
      setRecords([]);
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  }, []);

  /** Shared links use `?studentNumber=&code=`; without this, the page never loads records until the user submits. */
  useEffect(() => {
    const sn = searchParams.get("studentNumber")?.trim() ?? "";
    const cd = searchParams.get("code")?.trim() ?? "";
    if (!sn || !cd) return;
    setStudentNumber(sn);
    setCode(cd);
    void runLookup(sn, cd);
  }, [searchParams, runLookup]);

  const lookup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSn = studentNumber.trim();
    const trimmedCd = code.trim();
    if (!trimmedSn || !trimmedCd) {
      setError("Student number and access code are required.");
      return;
    }
    setError(null);
    // Sync the address bar (shareable link) and let `useEffect` run the fetch once — avoids double-request on submit.
    setSearchParams({ studentNumber: trimmedSn, code: trimmedCd }, { replace: true });
  };

  const computeRecord = async (recordId: string) => {
    setComputingRecordId(recordId);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/grade-subjects/public/records/${recordId}/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ studentNumber: studentNumber.trim(), code: code.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message || "Compute failed");
      }
      const updated = (await response.json()) as PublicRecord;
      setRecords((prev) => prev.map((record) => (record.id === updated.id ? updated : record)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compute failed");
    } finally {
      setComputingRecordId(null);
    }
  };

  // ---- filters ----------------------------------------------------------------------------------------------

  const terms = useMemo(() => distinctTerms(records.map(termOf)), [records]);
  const latest = useMemo(() => latestTerm(terms), [terms]);

  const years = useMemo(() => {
    const seen = new Map<string, GradeTerm>();
    for (const term of terms) if (term.yearId && !seen.has(term.yearId)) seen.set(term.yearId, term);
    return Array.from(seen.values()).sort(compareTermsNewestFirst);
  }, [terms]);
  const hasUndated = terms.some((term) => term.yearId === null);

  /** Semesters offered for the chosen year, newest first (all of them when every year is shown). */
  const semesters = useMemo(() => {
    if (yearFilter === NO_YEAR) return [];
    const values = new Set<number | null>();
    for (const term of terms) if (term.yearId && (yearFilter === ALL || term.yearId === yearFilter)) values.add(term.semester);
    return Array.from(values).sort((a, b) => (b ?? 0) - (a ?? 0));
  }, [terms, yearFilter]);

  const changeYear = (next: string) => {
    setYearFilter(next);
    if (next === ALL || next === NO_YEAR) {
      setSemesterFilter(ALL);
      return;
    }
    // Land on that year's latest semester rather than an empty combination.
    const newest = terms.find((term) => term.yearId === next);
    setSemesterFilter(newest ? semesterValue(newest.semester) : ALL);
  };

  const visible = useMemo(
    () =>
      records.filter((record) => {
        const term = termOf(record);
        const yearOk = yearFilter === ALL || (term.yearId ?? NO_YEAR) === yearFilter;
        const semesterOk = semesterFilter === ALL || semesterValue(term.semester) === semesterFilter;
        return yearOk && semesterOk;
      }),
    [records, yearFilter, semesterFilter]
  );

  /** The visible records grouped by term, newest term first. */
  const groups = useMemo(() => {
    const byKey = new Map<string, { term: GradeTerm; records: PublicRecord[] }>();
    for (const record of visible) {
      const term = termOf(record);
      const key = termKey(term);
      if (!byKey.has(key)) byKey.set(key, { term, records: [] });
      byKey.get(key)!.records.push(record);
    }
    return Array.from(byKey.values()).sort((a, b) => compareTermsNewestFirst(a.term, b.term));
  }, [visible]);

  const filtered = yearFilter !== ALL || semesterFilter !== ALL;
  const hidden = records.length - visible.length;
  const latestKey = latest ? termKey(latest) : null;
  // The term filters are always there once any of the student's grades has a term (even with one term, so the
  // page shows which term is on screen and the student can still pick another); undated grades have nothing to filter by.
  const showFilters = terms.some((term) => term.yearId !== null);

  const summary = (() => {
    const subjects = `${visible.length} subject${visible.length === 1 ? "" : "s"}`;
    if (!filtered) return `Showing every term — ${subjects}.`;
    const only = groups.length === 1 ? termLabel(groups[0].term) : null;
    const isLatest = groups.length === 1 && termKey(groups[0].term) === latestKey;
    return only ? `Showing ${only}${isLatest ? " (latest term)" : ""} — ${subjects}.` : `Showing ${subjects}.`;
  })();

  // The student, once, for the whole page (every record on this page belongs to the same student).
  const student = records[0] ? { name: records[0].studentName, number: records[0].studentNumber } : null;
  // One plain line about what is on screen: counts of the subjects shown, never a wall of numbers.
  const tally = (() => {
    const incomplete = visible.filter((r) => r.computedGrade?.incomplete).length;
    const passed = visible.filter((r) => !r.computedGrade?.incomplete && r.computedGrade?.passed === true).length;
    const failed = visible.filter((r) => !r.computedGrade?.incomplete && r.computedGrade?.passed === false).length;
    return { incomplete, passed, failed };
  })();

  const renderRecord = (record: PublicRecord) => {
    // Every expected item, so a blank shows up as "Missing" instead of the row simply not being there.
    const scored = (key: string) => typeof record.grades[key] === "number";
    const expected = record.items && record.items.length > 0 ? record.items : Object.keys(record.grades);
    const rows = [...expected, ...Object.keys(record.grades).filter((key) => !expected.includes(key))];
    const missing = rows.filter((key) => !scored(key));
    const computed = record.computedGrade;
    const incomplete = Boolean(computed?.incomplete);
    return (
      <article key={record.id} className="rounded-lg border border-border bg-surface p-4 sm:p-5" aria-label={record.subject.name}>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-56">
            <h3 className="text-lg font-semibold leading-snug text-foreground [text-wrap:balance]">{record.subject.name}</h3>
            {rows.length > 0 && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground-muted">
                {missing.length > 0 ? (
                  <>
                    <span className="rounded-full bg-warning-muted px-2 py-0.5 text-xs font-medium text-warning">{missing.length} missing</span>
                    <span>of {rows.length} items</span>
                  </>
                ) : (
                  <span>All {rows.length} items have a score.</span>
                )}
              </p>
            )}
          </div>
          <div className="w-full text-left sm:w-auto sm:text-right">
            <p className="text-base font-semibold tabular-nums text-foreground">Final: {incomplete ? "INC" : (computed?.finalGrade ?? "Not computed")}</p>
            {incomplete && (
              <p className="mt-0.5 text-sm font-medium text-warning">
                Incomplete{missing.length > 0 ? ` — ${missing.length} item${missing.length === 1 ? "" : "s"} missing` : ""}
              </p>
            )}
            {!incomplete && computed?.letterGrade && (
              <p className="mt-0.5 text-sm text-foreground-muted">
                {computed.letterGrade}
                {computed.remarks ? ` — ${computed.remarks}` : ""}
              </p>
            )}
            {computed?.passed !== null && computed?.passed !== undefined && (
              <span
                className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${computed.passed ? "bg-success-muted text-success" : "bg-danger-muted text-danger"}`}
              >
                {computed.passed ? "Pass" : "Fail"}
              </span>
            )}
          </div>
        </div>
        {incomplete && (
          <p className="mt-3 rounded-md bg-warning-muted px-3 py-2 text-sm text-foreground">
            INC means the grade cannot be computed until every item has a score. Ask your instructor to enter the missing score{missing.length === 1 ? "" : "s"} below.
          </p>
        )}
        {record.subject.studentComputeEnabled && (
          <button
            type="button"
            disabled={computingRecordId === record.id}
            onClick={() => void computeRecord(record.id)}
            className="mt-3 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 disabled:opacity-60"
          >
            {computingRecordId === record.id ? "Computing..." : "Compute my grade"}
          </button>
        )}
        <div className="mt-4 grid text-sm">
          {rows.map((key) => {
            const max = record.maxScores?.[key];
            const hasMax = typeof max === "number" && Number.isFinite(max);
            const isMissing = !scored(key);
            return (
              <div
                key={key}
                className={`flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0 ${isMissing ? "-mx-2 rounded bg-warning-muted/60 px-2" : ""}`}
              >
                <span className={isMissing ? "font-medium text-foreground" : "text-foreground-muted"}>{key}</span>
                <span className="shrink-0 tabular-nums text-foreground">
                  {isMissing ? (
                    <span className="rounded-full border border-warning/40 bg-warning-muted px-2 py-0.5 text-xs font-medium text-warning">Missing</span>
                  ) : (
                    <span className="font-medium">{record.grades[key]}</span>
                  )}
                  {hasMax && <span className="text-foreground-muted"> / {max}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </article>
    );
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6 md:py-10">
      <header className="flex items-center gap-3 border-b border-border pb-4">
        <img src="/favicon-32x32.png" alt="" width={32} height={32} className="h-9 w-9 rounded-md bg-white p-1 ring-1 ring-border" />
        <div className="leading-tight">
          <p className="text-base font-semibold text-foreground">Vantage</p>
          <p className="text-xs text-foreground-muted">MMSU College of Engineering</p>
        </div>
      </header>

      <div>
        <h1 className="text-2xl font-semibold text-foreground [text-wrap:balance] sm:text-3xl">Grade Lookup</h1>
        <p className="mt-1.5 max-w-prose text-sm text-foreground-muted">
          Enter your student number and the access code from your instructor to see your scores.
        </p>
      </div>

      <form className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:p-5 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={lookup}>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Student number
          <input className={inputClass} value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} autoComplete="off" inputMode="text" required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Access code
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" required />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-5 py-2.5 text-base font-medium text-primary-foreground hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 disabled:opacity-60 sm:text-sm"
        >
          {loading ? "Checking..." : "View grades"}
        </button>
      </form>

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-muted px-3 py-2.5 text-sm text-danger">
          {error}
        </div>
      )}

      {student && (
        <section aria-label="Your results" className="rounded-lg border border-border bg-surface-muted/50 p-4 sm:p-5">
          <p className="text-lg font-semibold text-foreground">{student.name}</p>
          <p className="text-sm tabular-nums text-foreground-muted">{student.number}</p>
          {showFilters && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2" role="group" aria-label="Filter by term">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Academic year
                <select className={selectClass} value={yearFilter} onChange={(e) => changeYear(e.target.value)}>
                  <option value={ALL}>All years</option>
                  {years.map((year) => (
                    <option key={year.yearId} value={year.yearId!}>
                      {year.yearName}
                      {latest?.yearId === year.yearId ? " (latest)" : ""}
                    </option>
                  ))}
                  {hasUndated && <option value={NO_YEAR}>No term set</option>}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Semester
                <select
                  className={`${selectClass} disabled:opacity-60`}
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                  disabled={yearFilter === NO_YEAR}
                >
                  <option value={ALL}>All semesters</option>
                  {semesters.map((semester) => (
                    <option key={semester ?? "unset"} value={semesterValue(semester)}>
                      {semester === null ? "Semester not set" : SEMESTER_LABEL[semester]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-foreground-muted">
            <p role="status" aria-live="polite">
              {summary}
              {hidden > 0 && ` ${hidden} more in other terms.`}
            </p>
            {filtered && (
              <button
                type="button"
                className="rounded font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                onClick={() => {
                  setYearFilter(ALL);
                  setSemesterFilter(ALL);
                }}
              >
                Show all terms
              </button>
            )}
          </div>
          {visible.length > 0 && (tally.incomplete > 0 || tally.passed > 0 || tally.failed > 0) && (
            <ul className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Results on this page">
              {tally.incomplete > 0 && <li className="rounded-full bg-warning-muted px-3 py-1 font-medium text-warning">{tally.incomplete} incomplete</li>}
              {tally.passed > 0 && <li className="rounded-full bg-success-muted px-3 py-1 font-medium text-success">{tally.passed} passed</li>}
              {tally.failed > 0 && <li className="rounded-full bg-danger-muted px-3 py-1 font-medium text-danger">{tally.failed} failed</li>}
            </ul>
          )}
        </section>
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={termKey(group.term)} className="space-y-3" aria-label={termLabel(group.term)}>
            {(groups.length > 1 || (!filtered && showFilters)) && (
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                {termLabel(group.term)}
                {termKey(group.term) === latestKey && (
                  <span className="rounded-full bg-primary-muted px-2 py-0.5 text-xs font-medium text-primary">Latest</span>
                )}
              </h2>
            )}
            {group.records.map(renderRecord)}
          </section>
        ))}
        {!loading && records.length > 0 && visible.length === 0 && (
          <p className="text-sm text-foreground-muted">No grades for this term. Choose another year or semester, or show all terms.</p>
        )}
        {!loading && records.length === 0 && !error && (
          <p className="max-w-prose text-sm text-foreground-muted">
            {hasSearched
              ? "No matching records for that student number and access code. Check both and try again, or ask your instructor to resend your code."
              : "Nothing to show yet. Enter your details above, or open the link your instructor sent you."}
          </p>
        )}
      </div>
    </main>
  );
}
