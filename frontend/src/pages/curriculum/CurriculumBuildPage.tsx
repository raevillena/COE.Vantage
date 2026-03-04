import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { apiClient } from "../../api/apiClient";
import type { Curriculum } from "../../types/api";
import type { SubjectDragItem } from "../../components/scheduler/schedulerTypes";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import toast from "react-hot-toast";

/** Subject list item from GET /curriculum/:id/subjects */
interface CurriculumSubject {
  id: string;
  code: string;
  name: string;
  units: number;
  isLab: boolean;
  yearLevel: number | null;
  semester: number | null;
}

/** Full subject for pool (has curriculumId) */
interface SubjectForPool {
  id: string;
  code: string;
  name: string;
  units: number;
  isLab: boolean;
  yearLevel: number | null;
  semester: number | null;
  curriculumId: string | null;
}

const YEAR_LEVELS = [1, 2, 3, 4, 5] as const;
const SEMESTERS = [1, 2, 3] as const; // 1 = 1st Sem, 2 = 2nd Sem, 3 = Mid Year
const SEMESTER_LABELS: Record<number, string> = { 1: "1st Sem", 2: "2nd Sem", 3: "Mid Year" };
const DROP_ID_POOL = "curriculum-build-pool";
const DROP_ID_UNGROUPED = "year-ungrouped";

function toDragItem(s: { id: string; code: string; name: string; isLab: boolean }): SubjectDragItem {
  return { type: "subject", subjectId: s.id, code: s.code, name: s.name, isLab: s.isLab };
}

function DraggablePoolSubject({ subject }: { subject: SubjectForPool }) {
  const item = toDragItem(subject);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `subject-${subject.id}`,
    data: item,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 rounded border border-border bg-surface px-2 py-1.5 text-sm text-foreground cursor-grab active:cursor-grabbing hover:bg-surface-muted ${isDragging ? "opacity-50" : ""}`}
    >
      <span className="font-medium truncate">{subject.code}</span>
      <span className="truncate text-foreground-muted">{subject.name}</span>
      {subject.isLab && <span className="text-xs text-foreground-muted">(Lab)</span>}
    </div>
  );
}

function DraggableTreeSubject({ subject, onRemove }: { subject: CurriculumSubject; onRemove?: (id: string) => void }) {
  const item = toDragItem(subject);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `subject-${subject.id}`,
    data: item,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 rounded border border-border bg-surface-muted px-2 py-1.5 text-sm text-foreground cursor-grab active:cursor-grabbing hover:bg-surface ${isDragging ? "opacity-50" : ""}`}
    >
      <span className="font-medium truncate">{subject.code}</span>
      <span className="truncate text-foreground-muted flex-1">{subject.name}</span>
      {subject.isLab && <span className="text-xs text-foreground-muted">(Lab)</span>}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(subject.id);
          }}
          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-foreground-muted hover:bg-danger-muted hover:text-danger focus:outline-none focus:ring-1 focus:ring-focus-ring"
          aria-label="Remove from curriculum"
        >
          ×
        </button>
      )}
    </div>
  );
}

interface YearDropZoneProps {
  yearLabel: string;
  dropId: string;
  subjects: CurriculumSubject[];
  isOver: boolean;
  onRemove?: (id: string) => void;
}

function YearDropZone({ yearLabel, dropId, subjects, isOver, onRemove }: YearDropZoneProps) {
  const { setNodeRef } = useDroppable({ id: dropId });
  return (
    <div
      ref={setNodeRef}
      className={`rounded border-2 border-dashed p-3 min-h-[52px] transition-colors ${isOver ? "border-primary bg-primary/10" : "border-border bg-surface-muted/30"}`}
    >
      <div className="text-xs font-semibold text-foreground-muted uppercase tracking-wide mb-2">{yearLabel}</div>
      <div className="space-y-1">
        {subjects.length === 0 ? (
          <p className="text-xs text-foreground-muted">Drop subjects here</p>
        ) : (
          subjects.map((s) => (
            <DraggableTreeSubject key={s.id} subject={s} onRemove={onRemove} />
          ))
        )}
      </div>
    </div>
  );
}

export function CurriculumBuildPage() {
  const { id: curriculumId } = useParams<{ id: string }>();
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [allSubjects, setAllSubjects] = useState<SubjectForPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [overId, setOverId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!curriculumId) return;
    setLoading(true);
    try {
      const [curRes, subRes, allRes] = await Promise.all([
        apiClient.get<Curriculum>(`/curriculum/${curriculumId}`),
        apiClient.get<CurriculumSubject[]>(`/curriculum/${curriculumId}/subjects`),
        apiClient.get<SubjectForPool[]>("/subjects"),
      ]);
      setCurriculum(curRes.data);
      setCurriculumSubjects(subRes.data ?? []);
      setAllSubjects(allRes.data ?? []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [curriculumId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Pool = subjects not in this curriculum (different curriculumId or null)
  const poolSubjects = allSubjects.filter(
    (s) => s.curriculumId !== curriculumId
  );

  // Group by year + semester: key "year-1-1", "year-1-2", "year-1-3", ... "ungrouped"
  const subjectsByYearAndSemester = (() => {
    const map = new Map<string, CurriculumSubject[]>();
    for (const s of curriculumSubjects) {
      const key =
        s.yearLevel != null && s.semester != null
          ? `year-${s.yearLevel}-${s.semester}`
          : "ungrouped";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.code.localeCompare(b.code));
    return map;
  })();

  const handleRemoveFromCurriculum = useCallback(
    async (subjectId: string) => {
      if (!curriculumId) return;
      // Optimistic update: move from curriculum lists back to pool immediately.
      setCurriculumSubjects((prev) => prev.filter((s) => s.id !== subjectId));
      setAllSubjects((prev) =>
        prev.map((s) =>
          s.id === subjectId
            ? { ...s, curriculumId: null, yearLevel: null, semester: null }
            : s
        )
      );
      try {
        await apiClient.patch(`/subjects/${subjectId}`, {
          curriculumId: null,
          yearLevel: null,
          semester: null,
        });
        toast.success("Subject removed from curriculum");
      } catch {
        toast.error("Failed to update. Data was reloaded.");
        loadData();
      }
    },
    [curriculumId, loadData],
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    setOverId(null);
    const { active, over } = event;
    if (!over?.id || typeof over.id !== "string" || !curriculumId) return;
    const data = active.data.current as SubjectDragItem | undefined;
    if (data?.type !== "subject") return;

    const subjectId = data.subjectId;
    const overId = over.id as string;

    if (overId === DROP_ID_POOL) {
      // Remove from curriculum (same behavior as X button).
      void handleRemoveFromCurriculum(subjectId);
      return;
    }

    const isUngrouped = overId === DROP_ID_UNGROUPED;
    const yearSemMatch = /^year-(\d+)-(\d+)$/.exec(overId);
    const yearLevel = isUngrouped ? null : yearSemMatch ? parseInt(yearSemMatch[1], 10) : null;
    const semester = isUngrouped ? null : yearSemMatch ? parseInt(yearSemMatch[2], 10) : null;
    if (!isUngrouped && !yearSemMatch) return;

    // Optimistic update for move/add within this curriculum.
    setCurriculumSubjects((prev) => {
      const existing = prev.find((s) => s.id === subjectId);
      if (existing) {
        // Move within curriculum: just change year/semester.
        return prev
          .map((s) =>
            s.id === subjectId ? { ...s, yearLevel, semester } : s
          )
          .sort((a, b) => a.code.localeCompare(b.code));
      }
      // Added from pool: build from allSubjects entry.
      const poolSubject = allSubjects.find((s) => s.id === subjectId);
      if (!poolSubject) return prev;
      const next: CurriculumSubject = {
        id: poolSubject.id,
        code: poolSubject.code,
        name: poolSubject.name,
        units: poolSubject.units,
        isLab: poolSubject.isLab,
        yearLevel,
        semester,
      };
      return [...prev, next].sort((a, b) => a.code.localeCompare(b.code));
    });
    setAllSubjects((prev) =>
      prev.map((s) =>
        s.id === subjectId
          ? { ...s, curriculumId, yearLevel, semester }
          : s
      )
    );

    try {
      await apiClient.patch(`/subjects/${subjectId}`, {
        curriculumId,
        yearLevel,
        semester,
      });
      const msg = isUngrouped
        ? "Moved to Ungrouped"
        : `Moved to Year ${yearLevel} — ${SEMESTER_LABELS[semester as 1 | 2 | 3] ?? ""}`;
      toast.success(msg);
    } catch {
      toast.error("Failed to update. Data was reloaded.");
      loadData();
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id != null ? String(event.over.id) : null);
  };

  const handleDragCancel = () => {
    setOverId(null);
  };

  if (!curriculumId) {
    return (
      <div className="p-4">
        <p className="text-foreground-muted">Missing curriculum id.</p>
        <Link to="/curriculum">
          <Button variant="secondary" className="mt-2">Back to Curriculum</Button>
        </Link>
      </div>
    );
  }

  if (loading && !curriculum) {
    return (
      <div className="flex justify-center py-12" aria-busy="true">
        <Spinner />
      </div>
    );
  }

  if (!curriculum) {
    return (
      <div className="p-4">
        <p className="text-foreground-muted">Curriculum not found.</p>
        <Link to="/curriculum">
          <Button variant="secondary" className="mt-2">Back to Curriculum</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/curriculum">
            <Button variant="secondary" className="text-sm">← Curriculum</Button>
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">
            Build curriculum — {curriculum.name}
          </h1>
        </div>
      </div>
      <p className="text-sm text-foreground-muted mb-4">
        Drag subjects from the pool into a year and semester to add them. Drag between semesters to move, or to the pool to remove.
      </p>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd} onDragOver={handleDragOver} onDragCancel={handleDragCancel}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Subject pool (droppable for "remove") */}
          <div className="lg:col-span-1">
            <PoolDropZone subjects={poolSubjects} isOver={overId === DROP_ID_POOL} />
          </div>

          {/* Curriculum tree by year and semester */}
          <div className="lg:col-span-2 space-y-4">
            {YEAR_LEVELS.map((year) => (
              <div key={year} className="rounded border border-border bg-surface-muted/20 overflow-hidden">
                <div className="px-3 py-2 bg-surface-muted font-semibold text-foreground text-sm">
                  Year {year}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3">
                  {SEMESTERS.map((sem) => {
                    const dropId = `year-${year}-${sem}`;
                    return (
                      <YearDropZone
                        key={dropId}
                        yearLabel={SEMESTER_LABELS[sem]}
                        dropId={dropId}
                        subjects={subjectsByYearAndSemester.get(dropId) ?? []}
                        isOver={overId === dropId}
                        onRemove={handleRemoveFromCurriculum}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            <YearDropZone
              yearLabel="Ungrouped"
              dropId={DROP_ID_UNGROUPED}
              subjects={subjectsByYearAndSemester.get("ungrouped") ?? []}
              isOver={overId === DROP_ID_UNGROUPED}
              onRemove={handleRemoveFromCurriculum}
            />
          </div>
        </div>
      </DndContext>
    </div>
  );
}

interface PoolDropZoneProps {
  subjects: SubjectForPool[];
  isOver: boolean;
}

function PoolDropZone({ subjects, isOver }: PoolDropZoneProps) {
  const { setNodeRef } = useDroppable({ id: DROP_ID_POOL });
  return (
    <div
      ref={setNodeRef}
      className={`rounded border-2 border-dashed p-4 min-h-[200px] transition-colors ${isOver ? "border-primary bg-primary/10" : "border-border bg-surface-muted/20"}`}
    >
      <h2 className="text-sm font-semibold text-foreground mb-2">Subject pool</h2>
      <p className="text-xs text-foreground-muted mb-3">
        Subjects not in this curriculum. Drop here to remove from curriculum.
      </p>
      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
        {subjects.length === 0 ? (
          <p className="text-xs text-foreground-muted">No subjects in pool.</p>
        ) : (
          subjects.map((s) => (
            <DraggablePoolSubject key={s.id} subject={s} />
          ))
        )}
      </div>
    </div>
  );
}
