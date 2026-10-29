import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { getApiErrorMessage } from "../../types/api";
import type { AcademicYear, College } from "../../types/api";
import { currentTerm } from "../../utils/currentTerm";
import { useAppSelector } from "../../store/hooks";
import { Button } from "../../components/ui/button";
import { HelpTip } from "../../components/ui/helpTip";
import { Spinner } from "../../components/ui/spinner";
import { HistoryButton } from "../../components/audit/HistoryButton";
import { DAY_NAMES, type GeGroup, type GeRow } from "../../components/scheduler/geImport/geImportTypes";

interface CollegeSet {
  id: string;
  academicYearId: string;
  semester: number;
  rowCount: number;
  sourceName: string | null;
  uploadedByName: string | null;
  updatedAt: string;
}

type CollegeResponse = { exists: false } | { exists: true; set: CollegeSet; rows: GeRow[]; groups: GeGroup[]; warnings: string[] };

interface Parsed {
  rows: GeRow[];
  groups: GeGroup[];
  warnings: string[];
}

const SEMESTERS = [
  { value: 1, label: "1st Sem" },
  { value: 2, label: "2nd Sem" },
];
const PAGE_ROWS = 150;
const fieldClass =
  "rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1";

function clock12(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}

function timeText(r: GeRow): string {
  if (!r.startTime || !r.endTime) return r.timeRaw || "No time";
  const pm = Number(r.endTime.split(":")[0]) >= 12 ? "PM" : "AM";
  return `${clock12(r.startTime)}-${clock12(r.endTime)} ${pm}`;
}

/**
 * The college-wide GE course offering sheet of a term. The college secretary pastes or uploads the whole sheet
 * once; chairmen then import their classes' GE subjects from it in the scheduler.
 */
export function GeSubjectsPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [data, setData] = useState<CollegeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  // the admin works on one college's sheet at a time; a college secretary has only their own
  const role = useAppSelector((st) => st.auth.user?.role);
  const isAdmin = role === "ADMIN";
  // the dean reads the sheet and its history but does not change it
  const viewerOnly = role === "DEAN";
  const [colleges, setColleges] = useState<College[]>([]);
  const [collegeId, setCollegeId] = useState("");
  const [loadError, setLoadError] = useState("");

  const [source, setSource] = useState<"paste" | "file">("paste");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [program, setProgram] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    apiClient
      .get<AcademicYear[]>("/academic-years")
      .then(({ data: ys }) => {
        setYears(ys);
        const term = currentTerm(ys);
        if (term) {
          setYearId(term.academicYearId);
          setSemester(term.semester === 2 ? 2 : 1);
        }
      })
      .catch(() => toast.error("Could not load the academic years"));
    apiClient
      .get<College[]>("/colleges")
      .then(({ data: cs }) => {
        setColleges(cs);
        setCollegeId((cur) => cur || cs[0]?.id || "");
      })
      .catch(() => setColleges([]));
  }, []);

  const load = useCallback(async () => {
    if (!yearId || (isAdmin && !collegeId)) return;
    setLoading(true);
    setLoadError("");
    try {
      const { data: res } = await apiClient.get<CollegeResponse>("/ge-import/college", { params: { academicYearId: yearId, semester, ...(isAdmin ? { collegeId } : {}) } });
      setData(res);
    } catch (err: unknown) {
      // a term with no sheet yet is not an error (the server answers exists: false); this is a real failure
      setData(null);
      setLoadError(getApiErrorMessage(err, "The GE schedule could not be read. Try again."));
    } finally {
      setLoading(false);
    }
  }, [yearId, semester, isAdmin, collegeId]);

  useEffect(() => {
    void load();
    setParsed(null);
    setConfirmReplace(false);
    setConfirmDelete(false);
    setProgram("");
    setQuery("");
  }, [load]);

  const readSource = async () => {
    setReading(true);
    try {
      let res: Parsed;
      if (source === "file" && file) {
        const form = new FormData();
        form.append("file", file);
        res = (await apiClient.post<Parsed>("/ge-import/parse", form)).data;
      } else {
        res = (await apiClient.post<Parsed>("/ge-import/parse", { text })).data;
      }
      setParsed(res);
    } catch (err: unknown) {
      setParsed(null);
      toast.error(getApiErrorMessage(err, "Could not read the schedule"));
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      if (source === "file" && file) {
        const form = new FormData();
        form.append("file", file);
        form.append("academicYearId", yearId);
        form.append("semester", String(semester));
        if (isAdmin && collegeId) form.append("collegeId", collegeId);
        await apiClient.put("/ge-import/college", form);
      } else {
        await apiClient.put("/ge-import/college", { academicYearId: yearId, semester, text, ...(isAdmin && collegeId ? { collegeId } : {}) });
      }
      toast.success("GE schedule saved for this term");
      setParsed(null);
      setText("");
      setFile(null);
      setConfirmReplace(false);
      await load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Could not save the GE schedule"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await apiClient.delete("/ge-import/college", { params: { academicYearId: yearId, semester, ...(isAdmin && collegeId ? { collegeId } : {}) } });
      toast.success("GE schedule removed for this term");
      setConfirmDelete(false);
      await load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Could not remove the GE schedule"));
    } finally {
      setSaving(false);
    }
  };

  const existing = data && data.exists ? data : null;
  const programs = useMemo(() => (existing ? [...new Set(existing.rows.map((r) => r.program))].sort() : []), [existing]);
  const shown = useMemo(() => {
    if (!existing) return [];
    const q = query.trim().toLowerCase();
    return existing.rows.filter(
      (r) =>
        (!program || r.program === program) &&
        (!q || `${r.code} ${r.title} ${r.faculty} ${r.room} ${r.section}`.toLowerCase().includes(q))
    );
  }, [existing, program, query]);
  const yearName = years.find((y) => y.id === yearId)?.name ?? "";
  const semLabel = SEMESTERS.find((s) => s.value === semester)?.label ?? "";
  const readyToSave = !!parsed && parsed.rows.length > 0 && !!yearId;

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-foreground">GE subjects</h1>
        <HelpTip>
          The college-wide GE course offering sheet for a term. Add the whole sheet once, by pasting it or choosing a file, and chairmen import their classes&apos; GE subjects from it in the scheduler (the Import GE button) instead of pasting it themselves. Adding a sheet for a term replaces the one saved before.{viewerOnly ? " You can view the sheet here; the college secretary adds and replaces it." : ""}
        </HelpTip>
        <HistoryButton entityType="GE_SHEET" title="GE subjects" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {isAdmin && colleges.length > 1 && (
          <div>
            <label htmlFor="ge-college" className="mb-1 block text-xs font-medium text-foreground-muted">College</label>
            <select id="ge-college" value={collegeId} onChange={(e) => setCollegeId(e.target.value)} className={fieldClass}>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="ge-year" className="mb-1 block text-xs font-medium text-foreground-muted">Academic year</label>
          <select id="ge-year" value={yearId} onChange={(e) => setYearId(e.target.value)} className={fieldClass}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.isActive ? `${y.name} (current)` : y.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ge-sem" className="mb-1 block text-xs font-medium text-foreground-muted">Semester</label>
          <select id="ge-sem" value={semester} onChange={(e) => setSemester(Number(e.target.value))} className={fieldClass}>
            {SEMESTERS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <section className="rounded border border-border bg-surface p-4" aria-label="Saved GE schedule">
        <h2 className="text-sm font-semibold text-foreground">Saved for {yearName}, {semLabel}</h2>
        {loading ? (
          <div className="mt-2" aria-busy="true"><Spinner /></div>
        ) : existing ? (
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-foreground-muted">
            <span>
              {existing.set.rowCount} rows from {existing.set.sourceName ?? "a pasted sheet"}, added by {existing.set.uploadedByName ?? "unknown"} on{" "}
              {new Date(existing.set.updatedAt).toLocaleString()}.
            </span>
            {viewerOnly ? null : confirmDelete ? (
              <span className="flex items-center gap-2">
                <span>Remove it?</span>
                <Button size="sm" variant="danger" onClick={remove} disabled={saving}>Yes, remove</Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)} disabled={saving}>Keep</Button>
              </span>
            ) : (
              <Button size="sm" variant="dangerOutline" onClick={() => setConfirmDelete(true)}>Remove</Button>
            )}
          </div>
        ) : loadError ? (
          <p role="alert" className="mt-1 text-sm text-danger">{loadError}</p>
        ) : (
          <p className="mt-1 text-sm text-foreground-muted">
            No GE subjects have been added for {yearName}, {semLabel} yet.{viewerOnly ? " The college secretary adds the sheet." : " Add the whole sheet below, and chairmen can then import their classes' GE subjects from it."}
          </p>
        )}
      </section>

      {!viewerOnly && (
      <section className="rounded border border-border bg-surface p-4" aria-label="Add the GE schedule">
        <h2 className="text-sm font-semibold text-foreground">{existing ? "Replace the sheet" : "Add the sheet"}</h2>
        <div className="mt-2 mb-2 flex items-center gap-2">
          <div role="tablist" aria-label="Source" className="inline-flex overflow-hidden rounded border border-border">
            {(["paste", "file"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={source === s}
                onClick={() => {
                  setSource(s);
                  setParsed(null);
                }}
                className={`px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-focus-ring ${source === s ? "bg-primary text-primary-foreground" : "bg-surface text-foreground hover:bg-surface-hover"}`}
              >
                {s === "paste" ? "Paste" : "File"}
              </button>
            ))}
          </div>
          <HelpTip>
            Copy all rows of the GE course offerings sheet, including the header row, and paste them. Or choose the file: Excel (.xlsx), CSV or text. Every program and section can be in it.
          </HelpTip>
        </div>
        {source === "paste" ? (
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setParsed(null);
            }}
            rows={7}
            placeholder="Paste the whole sheet here, header row first"
            aria-label="Pasted GE sheet"
            className={`${fieldClass} w-full font-mono text-xs`}
          />
        ) : (
          <div className="rounded border border-dashed border-border-strong bg-surface-muted/40 p-4 text-center text-sm">
            <p className="text-foreground-muted">{file ? file.name : "No file chosen"}</p>
            <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => fileInput.current?.click()}>Choose file</Button>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.csv,.tsv,.txt"
              className="hidden"
              aria-label="Choose GE sheet file"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setParsed(null);
                e.target.value = "";
              }}
            />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={readSource} disabled={reading || (source === "paste" ? text.trim() === "" : !file)}>
            {reading ? "Reading…" : "Check the sheet"}
          </Button>
          {readyToSave && !confirmReplace && (
            <Button type="button" onClick={() => (existing ? setConfirmReplace(true) : void save())} disabled={saving}>
              {saving ? "Saving…" : `Save for ${yearName}, ${semLabel}`}
            </Button>
          )}
          {readyToSave && confirmReplace && (
            <span className="flex items-center gap-2 text-sm text-foreground">
              Replace the {existing?.set.rowCount} saved rows?
              <Button size="sm" variant="danger" onClick={save} disabled={saving}>{saving ? "Saving…" : "Yes, replace"}</Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmReplace(false)} disabled={saving}>Cancel</Button>
            </span>
          )}
        </div>
        {parsed && (
          <div className="mt-3 rounded border border-border bg-surface-muted/40 p-3 text-sm text-foreground-muted">
            <p className="text-foreground">
              Read {parsed.rows.length} rows in {parsed.groups.length} sections.
            </p>
            <p>
              {parsed.rows.filter((r) => r.coeFaculty).length} rows by the college&apos;s own faculty are kept but chairmen skip them.{" "}
              {parsed.rows.filter((r) => !r.coeFaculty && r.problems.length > 0).length} rows have a problem (no time or day) and cannot be scheduled.
            </p>
            {parsed.warnings.map((w) => (
              <p key={w} className="text-warning">{w}</p>
            ))}
          </div>
        )}
      </section>

      )}

      {existing && (
        <section aria-label="Saved rows">
          <div className="mb-2 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="ge-program" className="mb-1 block text-xs font-medium text-foreground-muted">Program</label>
              <select id="ge-program" value={program} onChange={(e) => setProgram(e.target.value)} className={fieldClass}>
                <option value="">All programs</option>
                {programs.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[14rem] flex-1">
              <label htmlFor="ge-search" className="mb-1 block text-xs font-medium text-foreground-muted">Search</label>
              <input id="ge-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Course code, title, faculty or room" className={`${fieldClass} w-full`} />
            </div>
            <p className="pb-2 text-xs text-foreground-muted">
              {shown.length} of {existing.rows.length} rows{shown.length > PAGE_ROWS ? `, first ${PAGE_ROWS} shown` : ""}
            </p>
          </div>
          <div className="overflow-x-auto rounded border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-muted text-left text-xs font-medium text-foreground-muted">
                <tr>
                  <th className="px-2 py-2">Class</th>
                  <th className="px-2 py-2">Course code</th>
                  <th className="px-2 py-2">Title</th>
                  <th className="px-2 py-2">Units</th>
                  <th className="px-2 py-2">Day</th>
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Room</th>
                  <th className="px-2 py-2">Faculty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.slice(0, PAGE_ROWS).map((r) => (
                  <tr key={r.rowIndex} className={r.coeFaculty ? "text-foreground-muted" : r.problems.length ? "bg-warning-muted/40" : ""}>
                    <td className="whitespace-nowrap px-2 py-1.5">{r.program} {r.year ?? ""}-{r.section}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-medium">{r.code}</td>
                    <td className="px-2 py-1.5">{r.title}</td>
                    <td className="px-2 py-1.5">{r.units ?? ""}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{r.days.map((d) => DAY_NAMES[d]).join("") || r.dayRaw}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{timeText(r)}</td>
                    <td className="px-2 py-1.5">{r.room}</td>
                    <td className="px-2 py-1.5">
                      {r.faculty}
                      {r.problems.length > 0 && <span className="block text-xs text-warning">{r.problems.join("; ")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
