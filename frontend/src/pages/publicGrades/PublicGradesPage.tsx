import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

type PublicRecord = {
  id: string;
  studentName: string;
  studentNumber: string;
  code: string;
  grades: Record<string, number>;
  computedGrade?: {
    finalGrade?: number;
    letterGrade?: string | null;
    remarks?: string | null;
    passed?: boolean | null;
  } | null;
  subject: { id: string; name: string; code?: string | null; studentComputeEnabled?: boolean };
};

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Grade Lookup</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Enter your student number and access code to view your records.
        </p>
      </div>

      <form className="grid gap-3 rounded border border-border bg-surface p-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={lookup}>
        <input
          className="rounded border border-border-strong bg-background px-3 py-2 text-sm"
          placeholder="Student number"
          value={studentNumber}
          onChange={(e) => setStudentNumber(e.target.value)}
          required
        />
        <input
          className="rounded border border-border-strong bg-background px-3 py-2 text-sm"
          placeholder="Access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Checking..." : "View grades"}
        </button>
      </form>

      {error && <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="space-y-3">
        {records.map((record) => (
          <div key={record.id} className="rounded border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-foreground">{record.subject.name}</h2>
                <p className="text-xs text-foreground-muted">
                  {record.studentName} - {record.studentNumber}
                </p>
              </div>
              <div className="text-right text-sm font-medium text-foreground">
                <div>Final: {record.computedGrade?.finalGrade ?? "Not computed"}</div>
                {record.computedGrade?.letterGrade && (
                  <div className="mt-0.5 text-xs font-semibold text-foreground-muted">
                    {record.computedGrade.letterGrade}
                    {record.computedGrade.remarks ? ` — ${record.computedGrade.remarks}` : ""}
                  </div>
                )}
                {record.computedGrade?.passed !== null && record.computedGrade?.passed !== undefined && (
                  <div
                    className={`mt-0.5 text-xs font-medium ${
                      record.computedGrade.passed ? "text-success" : "text-danger"
                    }`}
                  >
                    {record.computedGrade.passed ? "Pass" : "Fail"}
                  </div>
                )}
              </div>
            </div>
            {record.subject.studentComputeEnabled && (
              <button
                type="button"
                disabled={computingRecordId === record.id}
                onClick={() => void computeRecord(record.id)}
                className="mt-2 rounded border border-border-strong bg-background px-3 py-1 text-xs hover:bg-surface-hover disabled:opacity-60"
              >
                {computingRecordId === record.id ? "Computing..." : "Compute my grade"}
              </button>
            )}
            <div className="mt-3 grid gap-1 text-sm">
              {Object.entries(record.grades).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between border-b border-border/50 py-1">
                  <span className="text-foreground-muted">{key}</span>
                  <span className="text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!loading && records.length === 0 && !error && (
          <p className="text-sm text-foreground-muted">
            {hasSearched
              ? "No matching records for that student number and access code."
              : "No records loaded yet. Enter your details above or open the link copied from your instructor."}
          </p>
        )}
      </div>
    </div>
  );
}

