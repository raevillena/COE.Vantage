import { useState, useEffect, useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Curriculum, Subject, FacultyLoad } from "../../types/api";
import { apiClient } from "../../api/apiClient";
import type { SubjectDragItem } from "./schedulerTypes";

interface SubjectItemProps {
  subject: Subject;
  status?: "none" | "partial" | "full";
  label?: string;
}

function DraggableSubject({ subject, status = "none", label }: SubjectItemProps) {
  const item: SubjectDragItem = {
    type: "subject",
    subjectId: subject.id,
    code: subject.code,
    name: subject.name,
    isLab: subject.isLab,
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `subject-${subject.id}`,
    data: item,
  });
  const stateClass =
    status === "full"
      ? "border-emerald-500/70 bg-emerald-50"
      : status === "partial"
      ? "border-amber-400/70 bg-amber-50"
      : "border-rose-300/60 bg-rose-50";
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 rounded border px-2 py-1.5 text-sm text-foreground cursor-grab active:cursor-grabbing hover:bg-surface-muted ${stateClass} ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <span className="font-medium truncate">{subject.code}</span>
      <span className="truncate text-foreground-muted">
        {subject.name}
        {label ? <span className="text-[11px] text-foreground-muted/80"> · {label}</span> : null}
      </span>
      {subject.isLab && <span className="text-xs text-foreground-muted">(Lab)</span>}
    </div>
  );
}

/** Group subjects by curriculumId; null/undefined -> "Ungrouped". */
function groupSubjectsByCurriculum(subjects: Subject[]): Map<string | null, Subject[]> {
  const map = new Map<string | null, Subject[]>();
  for (const s of subjects) {
    const key = s.curriculumId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.code.localeCompare(b.code));
  return map;
}

function formatYearLabel(yearLevel: number): string {
  const suffix =
    yearLevel % 10 === 1 && yearLevel % 100 !== 11
      ? "st"
      : yearLevel % 10 === 2 && yearLevel % 100 !== 12
      ? "nd"
      : yearLevel % 10 === 3 && yearLevel % 100 !== 13
      ? "rd"
      : "th";
  return `${yearLevel}${suffix} year`;
}

export interface CurriculumSubjectTreeProps {
  curriculumId?: string;
  yearLevel?: number;
  /** Loads for the current class view, used to compute scheduled minutes per subject. */
  classLoads?: FacultyLoad[];
}

export function CurriculumSubjectTree({ curriculumId, yearLevel, classLoads }: CurriculumSubjectTreeProps) {
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiClient.get<Curriculum[]>("/curriculum").then(({ data }) => setCurricula(data));
    apiClient.get<Subject[]>("/subjects").then(({ data }) => setSubjects(data));
  }, []);

  // When switching curriculum/year context, default-expand the Year group; keep Others collapsed.
  useEffect(() => {
    if (curriculumId && yearLevel != null) {
      setExpandedIds(new Set(["year-main"]));
    } else {
      setExpandedIds(new Set());
    }
  }, [curriculumId, yearLevel]);

  const byCurriculum = useMemo(() => groupSubjectsByCurriculum(subjects), [subjects]);
  const minutesBySubject = useMemo(() => {
    const map = new Map<string, number>();
    if (!classLoads) return map;
    for (const l of classLoads) {
      const start = l.startTime;
      const end = l.endTime;
      if (!start || !end) continue;
      const [sh, sm] = start.split(":").map((v) => parseInt(v, 10));
      const [eh, em] = end.split(":").map((v) => parseInt(v, 10));
      if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) continue;
      const mins = (eh * 60 + em) - (sh * 60 + sm);
      map.set(l.subjectId, (map.get(l.subjectId) ?? 0) + mins);
    }
    return map;
  }, [classLoads]);

  const getStatusForSubject = (s: Subject): { status: "none" | "partial" | "full"; label: string } => {
    // Lectures: 1 unit = 1 hr/week; Labs: 1 unit = 3 hrs/week.
    const required = (s.isLab ? s.units * 3 : s.units) * 60;
    const scheduled = minutesBySubject.get(s.id) ?? 0;
    if (required <= 0) {
      return { status: "none", label: "0 hrs" };
    }
    const scheduledHours = scheduled / 60;
    const requiredHours = required / 60;
    const label = `${scheduledHours}/${requiredHours} hrs`;
    if (scheduled === 0) return { status: "none", label };
    if (scheduled < required) return { status: "partial", label };
    return { status: "full", label };
  };

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCurriculum = curriculumId ? curricula.find((c) => c.id === curriculumId) : undefined;

  // When curriculumId and yearLevel are provided (class view), show a focused tree for that curriculum:
  if (selectedCurriculum && yearLevel != null) {
    const allForCurriculum = byCurriculum.get(selectedCurriculum.id) ?? [];
    const mainYear = allForCurriculum.filter((s) => s.yearLevel === yearLevel);
    const others = allForCurriculum.filter((s) => s.yearLevel == null || s.yearLevel !== yearLevel);
    return (
      <div className="flex flex-col h-full min-h-0">
        <h2 className="text-sm font-semibold text-foreground mb-2 px-1">
          Subjects · {selectedCurriculum.name} ({formatYearLabel(yearLevel)})
        </h2>
        <div className="flex-1 overflow-y-auto space-y-2">
          <div className="rounded border border-border bg-surface-muted/50 overflow-hidden">
            <button
              type="button"
              onClick={() => toggle("year-main")}
              className="w-full flex items-center justify-between px-2 py-2 text-left text-sm font-medium text-foreground hover:bg-surface-muted"
            >
              <span className="truncate">{formatYearLabel(yearLevel)}</span>
              <span className="text-foreground-muted">{expandedIds.has("year-main") ? "▼" : "▶"}</span>
            </button>
            {expandedIds.has("year-main") && (
              <div className="px-2 pb-2 space-y-1 border-t border-border pt-1">
                {mainYear.length === 0 ? (
                  <p className="text-xs text-foreground-muted py-1">No subjects assigned to this year.</p>
                ) : (
                  mainYear.map((s) => {
                    const { status, label } = getStatusForSubject(s);
                    return <DraggableSubject key={s.id} subject={s} status={status} label={label} />;
                  })
                )}
              </div>
            )}
          </div>
          <div className="rounded border border-border bg-surface-muted/50 overflow-hidden">
            <button
              type="button"
              onClick={() => toggle("year-others")}
              className="w-full flex items-center justify-between px-2 py-2 text-left text-sm font-medium text-foreground hover:bg-surface-muted"
            >
              <span className="truncate">Others</span>
              <span className="text-foreground-muted">{expandedIds.has("year-others") ? "▼" : "▶"}</span>
            </button>
            {expandedIds.has("year-others") && (
              <div className="px-2 pb-2 space-y-1 border-t border-border pt-1">
                {others.length === 0 ? (
                  <p className="text-xs text-foreground-muted py-1">No other subjects in this program.</p>
                ) : (
                  others.map((s) => {
                    const { status, label } = getStatusForSubject(s);
                    return <DraggableSubject key={s.id} subject={s} status={status} label={label} />;
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default: original multi-curriculum tree with Ungrouped.
  return (
    <div className="flex flex-col h-full min-h-0">
      <h2 className="text-sm font-semibold text-foreground mb-2 px-1">Curriculum</h2>
      <div className="flex-1 overflow-y-auto space-y-1">
        {curricula.map((c) => {
          const subs = byCurriculum.get(c.id) ?? [];
          const isExpanded = expandedIds.has(c.id);
          return (
            <div key={c.id} className="rounded border border-border bg-surface-muted/50 overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className="w-full flex items-center justify-between px-2 py-2 text-left text-sm font-medium text-foreground hover:bg-surface-muted"
              >
                <span className="truncate">{c.name}</span>
                <span className="text-foreground-muted">{isExpanded ? "▼" : "▶"}</span>
              </button>
              {isExpanded && (
                <div className="px-2 pb-2 space-y-1 border-t border-border pt-1">
                  {subs.length === 0 ? (
                    <p className="text-xs text-foreground-muted py-1">No subjects</p>
                  ) : (
                    subs.map((s) => {
                      const { status, label } = getStatusForSubject(s);
                      return <DraggableSubject key={s.id} subject={s} status={status} label={label} />;
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
        {byCurriculum.has(null) && (byCurriculum.get(null)?.length ?? 0) > 0 && (
          <div className="rounded border border-border bg-surface-muted/50 overflow-hidden">
            <button
              type="button"
              onClick={() => toggle("__ungrouped__")}
              className="w-full flex items-center justify-between px-2 py-2 text-left text-sm font-medium text-foreground hover:bg-surface-muted"
            >
              <span>Ungrouped</span>
              <span className="text-foreground-muted">{expandedIds.has("__ungrouped__") ? "▼" : "▶"}</span>
            </button>
            {expandedIds.has("__ungrouped__") && (
              <div className="px-2 pb-2 space-y-1 border-t border-border pt-1">
                {(byCurriculum.get(null) ?? []).map((s) => {
                  const { status, label } = getStatusForSubject(s);
                  return <DraggableSubject key={s.id} subject={s} status={status} label={label} />;
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
