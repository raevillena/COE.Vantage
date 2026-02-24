import { useState, useEffect, useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Curriculum, Subject } from "../../types/api";
import { apiClient } from "../../api/apiClient";
import type { SubjectDragItem } from "./schedulerTypes";

interface SubjectItemProps {
  subject: Subject;
}

function DraggableSubject({ subject }: SubjectItemProps) {
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
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 rounded border border-border bg-surface px-2 py-1.5 text-sm text-foreground cursor-grab active:cursor-grabbing ${isDragging ? "opacity-50" : ""} hover:bg-surface-muted`}
    >
      <span className="font-medium truncate">{subject.code}</span>
      <span className="truncate text-foreground-muted">{subject.name}</span>
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

export function CurriculumSubjectTree() {
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiClient.get<Curriculum[]>("/curriculum").then(({ data }) => setCurricula(data));
    apiClient.get<Subject[]>("/subjects").then(({ data }) => setSubjects(data));
  }, []);

  const byCurriculum = useMemo(() => groupSubjectsByCurriculum(subjects), [subjects]);

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
                    subs.map((s) => <DraggableSubject key={s.id} subject={s} />)
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
                {(byCurriculum.get(null) ?? []).map((s) => (
                  <DraggableSubject key={s.id} subject={s} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
