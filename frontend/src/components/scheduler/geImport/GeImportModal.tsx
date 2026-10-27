import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { apiClient } from "../../../api/apiClient";
import { getApiErrorMessage } from "../../../types/api";
import type { StudentClass } from "../../../types/api";
import { Button } from "../../ui/button";
import { Dialog } from "../../ui/dialog";
import { HelpTip } from "../../ui/helpTip";
import { Spinner } from "../../ui/spinner";
import { GeMatchStep, effectiveSubjectId } from "./GeMatchStep";
import { GeReviewStep } from "./GeReviewStep";
import {
  guessGroup,
  rowKey,
  type ClassSubject,
  type GeParsed,
  type ImportBlock,
  type PreviewResult,
} from "./geImportTypes";

interface Props {
  studentClasses: StudentClass[];
  initialClassId: string;
  academicYearId: string;
  academicYearName: string;
  semester: number;
  onClose: () => void;
  onSaved: () => void;
}

const STEPS = ["Source", "Match subjects", "Review and resolve", "Done"];
const fieldClass =
  "w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1";

/**
 * Imports a GE course offering sheet into one class: read the file or pasted rows, match them to the class
 * subjects by course code (or by hand), then resolve conflicts before saving. Faculty and rooms stay as text.
 */
export function GeImportModal({ studentClasses, initialClassId, academicYearId, academicYearName, semester, onClose, onSaved }: Props) {
  const [step, setStep] = useState(1);
  const [classId, setClassId] = useState(initialClassId);
  const [source, setSource] = useState<"file" | "paste">("paste");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<GeParsed | null>(null);
  const [groupKey, setGroupKey] = useState("");
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [blocks, setBlocks] = useState<ImportBlock[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [warningsReviewed, setWarningsReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ created: number; alreadyScheduled: number; skipped: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const termOk = semester === 1 || semester === 2;
  const cls = studentClasses.find((c) => c.id === classId);

  const groupRows = useMemo(
    () => (parsed ? parsed.rows.filter((r) => `${r.program}|${r.year ?? ""}|${r.section}` === groupKey) : []),
    [parsed, groupKey]
  );
  const coeRows = groupRows.filter((r) => r.coeFaculty);
  const brokenRows = groupRows.filter((r) => !r.coeFaculty && r.problems.length > 0);
  const schedulable = groupRows.filter((r) => !r.coeFaculty && r.problems.length === 0);

  // The class subjects for the term (needed to match by course code).
  useEffect(() => {
    setSubjects([]);
    if (!classId || !termOk) return;
    let cancelled = false;
    apiClient
      .get<{ subjects: ClassSubject[] }>("/ge-import/class-subjects", { params: { studentClassId: classId, academicYearId, semester } })
      .then(({ data }) => !cancelled && setSubjects(data.subjects))
      .catch((err) => !cancelled && toast.error(getApiErrorMessage(err, "Could not load the class subjects")));
    return () => {
      cancelled = true;
    };
  }, [classId, academicYearId, semester, termOk]);

  // Picking a class selects the matching section of the file.
  useEffect(() => {
    if (parsed && cls) setGroupKey((cur) => guessGroup(cls.name, parsed.groups) || cur);
  }, [cls, parsed]);

  const readSource = async () => {
    setParsing(true);
    try {
      let data: GeParsed;
      if (source === "file" && file) {
        const form = new FormData();
        form.append("file", file);
        data = (await apiClient.post<GeParsed>("/ge-import/parse", form)).data;
      } else {
        data = (await apiClient.post<GeParsed>("/ge-import/parse", { text })).data;
      }
      setParsed(data);
      setAssign({});
      setGroupKey(cls ? guessGroup(cls.name, data.groups) : "");
    } catch (err: unknown) {
      setParsed(null);
      toast.error(getApiErrorMessage(err, "Could not read the schedule"));
    } finally {
      setParsing(false);
    }
  };

  const onAssign = (key: string, value: string | null) =>
    setAssign((prev) => {
      const next = { ...prev };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });

  const matchedCount = schedulable.filter((r) => {
    const id = effectiveSubjectId(r, subjects, assign);
    return id && id !== "skip";
  }).length;

  /** Builds the editable blocks (one per row and day) when moving on to the review. */
  const buildBlocks = (): ImportBlock[] => {
    const out: ImportBlock[] = [];
    for (const r of schedulable) {
      const subjectId = effectiveSubjectId(r, subjects, assign);
      if (!subjectId || subjectId === "skip") continue;
      for (const day of r.days) {
        out.push({
          key: `${rowKey(r)}-${day}`,
          rowKey: rowKey(r),
          subjectId,
          dayOfWeek: day,
          startTime: r.startTime ?? "",
          endTime: r.endTime ?? "",
          room: r.room,
          faculty: r.faculty,
          skip: false,
        });
      }
    }
    return out;
  };

  const goReview = () => {
    setBlocks(buildBlocks());
    setPreview(null);
    setWarningsReviewed(false);
    setStep(3);
  };

  const payload = useCallback(
    () => ({
      studentClassId: classId,
      academicYearId,
      semester,
      blocks: blocks.map((b) => ({
        key: b.key,
        subjectId: b.subjectId,
        dayOfWeek: b.dayOfWeek,
        startTime: b.startTime,
        endTime: b.endTime,
        roomDisplayName: b.room,
        facultyDisplayName: b.faculty,
        skip: b.skip,
      })),
    }),
    [blocks, classId, academicYearId, semester]
  );

  // Re-check after every edit (debounced).
  useEffect(() => {
    if (step !== 3 || blocks.length === 0) return;
    setPreviewing(true);
    let cancelled = false;
    const t = setTimeout(() => {
      apiClient
        .post<PreviewResult>("/ge-import/preview", payload())
        .then(({ data }) => {
          if (cancelled) return;
          setPreview(data);
          if (data.warningCount === 0) setWarningsReviewed(false);
        })
        .catch((err) => !cancelled && toast.error(getApiErrorMessage(err, "Could not check the schedule")))
        .finally(() => !cancelled && setPreviewing(false));
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [step, blocks, payload]);

  const onBlockChange = (key: string, patch: Partial<ImportBlock>) => {
    setPreview(null);
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  };

  const newCount = preview?.blocks.filter((b) => b.state === "new").length ?? 0;
  const canSave = !!preview && !previewing && preview.blockingCount === 0 && newCount > 0 && (preview.warningCount === 0 || warningsReviewed);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await apiClient.post<{ created: number; alreadyScheduled: number; skipped: number }>("/ge-import/save", payload());
      setResult(data);
      setStep(4);
      onSaved();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Could not save the schedule"));
    } finally {
      setSaving(false);
    }
  };

  const step1Ready = !!classId && termOk && !!parsed && !!groupKey && schedulable.length > 0;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !saving && onClose()}>
      <Dialog.Content className="!max-w-6xl w-[96vw] max-h-[92vh] overflow-y-auto" title="Import GE schedule">
        <ol className="mt-2 flex flex-wrap gap-2 text-xs" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={step === i + 1 ? "step" : undefined}
              className={`rounded-full px-3 py-1 ${step === i + 1 ? "bg-primary text-primary-foreground" : i + 1 < step ? "bg-primary-muted text-primary" : "bg-surface-muted text-foreground-muted"}`}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>

        <div className="mt-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label htmlFor="ge-class" className="mb-1 block text-xs font-medium text-foreground-muted">Class to import into</label>
                  <select id="ge-class" value={classId} onChange={(e) => setClassId(e.target.value)} className={fieldClass}>
                    <option value="">Select class…</option>
                    {studentClasses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <p className="self-end pb-2 text-sm text-foreground-muted">
                  {academicYearName}, {semester === 1 ? "1st Sem" : semester === 2 ? "2nd Sem" : "Mid Year"}
                </p>
              </div>
              {!termOk && <p className="rounded border border-warning bg-warning-muted px-3 py-2 text-sm text-warning">Schedules can be imported for the 1st or 2nd semester only. Change the semester in the scheduler first.</p>}

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <div role="tablist" aria-label="Source" className="inline-flex overflow-hidden rounded border border-border">
                    {(["paste", "file"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="tab"
                        aria-selected={source === s}
                        onClick={() => setSource(s)}
                        className={`px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-focus-ring ${source === s ? "bg-primary text-primary-foreground" : "bg-surface text-foreground hover:bg-surface-hover"}`}
                      >
                        {s === "paste" ? "Paste" : "File"}
                      </button>
                    ))}
                  </div>
                  <HelpTip>
                    Copy the rows from the GE course offerings sheet, including the header row (Program, Year, Section, Course Code, and so on), and paste them. Or choose the file: Excel (.xlsx), CSV or text. Rows of every program and section can be included; you pick the section of this class next.
                  </HelpTip>
                </div>
                {source === "paste" ? (
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={8}
                    placeholder="Paste the rows here, header row first"
                    aria-label="Pasted schedule rows"
                    className={`${fieldClass} font-mono text-xs`}
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
                      aria-label="Choose schedule file"
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <Button type="button" onClick={readSource} disabled={parsing || (source === "paste" ? text.trim() === "" : !file)}>
                    {parsing ? "Reading…" : "Read schedule"}
                  </Button>
                  {parsing && <Spinner />}
                </div>
              </div>

              {parsed && (
                <div className="space-y-3 rounded border border-border bg-surface-muted/40 p-3">
                  <p className="text-sm text-foreground">
                    Read {parsed.rows.length} rows in {parsed.groups.length} sections.
                  </p>
                  {parsed.warnings.map((w) => (
                    <p key={w} className="text-sm text-warning">{w}</p>
                  ))}
                  <div className="max-w-md">
                    <label htmlFor="ge-group" className="mb-1 block text-xs font-medium text-foreground-muted">Section in the file for {cls?.name ?? "this class"}</label>
                    <select id="ge-group" value={groupKey} onChange={(e) => setGroupKey(e.target.value)} className={fieldClass}>
                      <option value="">Select section…</option>
                      {parsed.groups.map((g) => (
                        <option key={g.key} value={g.key}>
                          {g.program} {g.year ?? ""}-{g.section} ({g.count} rows)
                        </option>
                      ))}
                    </select>
                  </div>
                  {groupKey && (
                    <div className="text-sm text-foreground-muted">
                      <p>{schedulable.length} rows can be scheduled.</p>
                      {coeRows.length > 0 && (
                        <p>{coeRows.length} rows by the college&apos;s own faculty (such as {coeRows[0].code}) are skipped; they are not GE subjects.</p>
                      )}
                      {brokenRows.length > 0 && (
                        <ul className="mt-1 list-disc pl-5 text-warning">
                          {brokenRows.map((r) => (
                            <li key={r.rowIndex}>{r.code || "Row " + r.rowIndex}: {r.problems.join("; ")}. Left out.</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && <GeMatchStep rows={schedulable} subjects={subjects} assign={assign} onAssign={onAssign} />}

          {step === 3 && (
            <GeReviewStep
              blocks={blocks}
              subjects={subjects}
              preview={preview}
              previewing={previewing}
              onChange={onBlockChange}
              warningsReviewed={warningsReviewed}
              onWarningsReviewed={setWarningsReviewed}
            />
          )}

          {step === 4 && result && (
            <div className="rounded border border-border bg-surface-muted/40 p-6 text-center">
              <p className="text-lg font-semibold text-foreground">
                Added {result.created} {result.created === 1 ? "block" : "blocks"} to {cls?.name}
              </p>
              <p className="mt-1 text-sm text-foreground-muted">
                {result.alreadyScheduled > 0 ? `${result.alreadyScheduled} were already scheduled. ` : ""}
                {result.skipped > 0 ? `${result.skipped} were skipped.` : ""}
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <div>
            {(step === 2 || step === 3) && (
              <Button type="button" variant="secondary" onClick={() => setStep(step - 1)} disabled={saving}>Back</Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 4 ? (
              <Button type="button" onClick={onClose}>Close</Button>
            ) : (
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            )}
            {step === 1 && <Button type="button" onClick={() => setStep(2)} disabled={!step1Ready}>Next: match subjects</Button>}
            {step === 2 && <Button type="button" onClick={goReview} disabled={matchedCount === 0}>Next: review ({matchedCount} matched)</Button>}
            {step === 3 && <Button type="button" onClick={save} disabled={!canSave || saving}>{saving ? "Saving…" : `Add ${newCount} ${newCount === 1 ? "block" : "blocks"}`}</Button>}
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

