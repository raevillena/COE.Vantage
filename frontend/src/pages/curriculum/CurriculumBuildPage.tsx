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
import type { Curriculum, CurriculumSpecialization } from "../../types/api";
import { SpecializationsManager, SubjectSpecializationEditor } from "../../components/curriculum/SpecializationDialogs";
import type { SubjectDragItem } from "../../components/scheduler/schedulerTypes";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import toast from "react-hot-toast";
import { HelpTip } from "../../components/ui/helpTip";

/** Subject list item from GET /curriculum/:id/subjects */
interface CurriculumSubject {
  id: string;
  code: string;
  name: string;
  units: number;
  isLab: boolean;
  yearLevel: number | null;
  semester: number | null;
  /** Empty = common to every specialization of the curriculum. */
  specializations: { id: string; name: string }[];
}

/** Full subject for pool (has curriculumId) */
interface SubjectForPool {
  id: string;
  code: string;
  name: string;
  units: number;
  isLab: boolean;
  lecUnits?: number;
  labUnits?: number;
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
      title={subject.name}
    >
      <span className="font-medium truncate shrink-0">{subject.code}</span>
      <span className="truncate text-foreground-muted min-w-0">{subject.name}</span>
      {subject.isLab && <span className="text-xs text-foreground-muted shrink-0">(Lab)</span>}
    </div>
  );
}

function DraggableTreeSubject({ subject, onRemove, onEditSpecializations }: { subject: CurriculumSubject; onRemove?: (id: string) => void; onEditSpecializations?: (subject: CurriculumSubject) => void }) {
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
      title={subject.name}
    >
      <span className="font-medium truncate shrink-0">{subject.code}</span>
      <span className="truncate text-foreground-muted min-w-0 flex-1">{subject.name}</span>
      {subject.isLab && <span className="text-xs text-foreground-muted shrink-0">(Lab)</span>}
      {subject.specializations.map((sp) => (
        <span key={sp.id} className="shrink-0 rounded-full bg-primary-muted px-1.5 py-0.5 text-[11px] font-medium text-primary" title={`Only for the ${sp.name} specialization`}>
          {sp.name}
        </span>
      ))}
      {onEditSpecializations && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEditSpecializations(subject);
          }}
          className="shrink-0 rounded px-1 text-[11px] font-medium text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-focus-ring"
          aria-label={`Set specializations of ${subject.code}`}
        >
          Track
        </button>
      )}
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
  onEditSpecializations?: (subject: CurriculumSubject) => void;
}

function YearDropZone({ yearLabel, dropId, subjects, isOver, onRemove, onEditSpecializations }: YearDropZoneProps) {
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
            <DraggableTreeSubject key={s.id} subject={s} onRemove={onRemove} onEditSpecializations={onEditSpecializations} />
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
  const [specs, setSpecs] = useState<CurriculumSpecialization[]>([]);
  /** What the tree shows and what a dropped subject becomes: "" = every subject (added as common), "common", or a specialization id. */
  const [view, setView] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [specSubject, setSpecSubject] = useState<CurriculumSubject | null>(null);

  const loadData = useCallback(async () => {
    if (!curriculumId) return;
    setLoading(true);
    try {
      const [curRes, subRes, allRes, specRes] = await Promise.all([
        apiClient.get<Curriculum>(`/curriculum/${curriculumId}`),
        apiClient.get<CurriculumSubject[]>(`/curriculum/${curriculumId}/subjects`),
        apiClient.get<SubjectForPool[]>("/subjects"),
        apiClient.get<CurriculumSpecialization[]>(`/curriculum/${curriculumId}/specializations`).catch(() => ({ data: [] as CurriculumSpecialization[] })),
      ]);
      setCurriculum(curRes.data);
      setCurriculumSubjects(subRes.data ?? []);
      setAllSubjects(allRes.data ?? []);
      setSpecs(specRes.data ?? []);
      // a specialization that no longer exists cannot stay selected
      setView((v) => (v && v !== "common" && !(specRes.data ?? []).some((sp) => sp.id === v) ? "" : v));
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

  /** The working view: everything, only common subjects, or what one specialization takes (common + its own). */
  const inView = (s: CurriculumSubject) =>
    view === "" ? true : view === "common" ? s.specializations.length === 0 : s.specializations.length === 0 || s.specializations.some((sp) => sp.id === view);
  const viewSpec = specs.find((sp) => sp.id === view);

  // Group by year + semester: key "year-1-1", "year-1-2", "year-1-3", ... "ungrouped"
  const subjectsByYearAndSemester = (() => {
    const map = new Map<string, CurriculumSubject[]>();
    for (const s of curriculumSubjects.filter(inView)) {
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
      void handleRemoveFromCurriculum(subjectId);
      return;
    }

    const isUngrouped = overId === DROP_ID_UNGROUPED;
    const yearSemMatch = /^year-(\d+)-(\d+)$/.exec(overId);
    const yearLevel = isUngrouped ? null : yearSemMatch ? parseInt(yearSemMatch[1], 10) : null;
    const semester = isUngrouped ? null : yearSemMatch ? parseInt(yearSemMatch[2], 10) : null;
    if (!isUngrouped && !yearSemMatch) return;

    const existingInCurriculum = curriculumSubjects.find((s) => s.id === subjectId);
    const poolSubject = allSubjects.find((s) => s.id === subjectId);

    if (existingInCurriculum) {
      // Move within same curriculum: PATCH year/semester only.
      setCurriculumSubjects((prev) =>
        prev
          .map((s) =>
            s.id === subjectId ? { ...s, yearLevel, semester } : s
          )
          .sort((a, b) => a.code.localeCompare(b.code))
      );
      try {
        await apiClient.patch(`/subjects/${subjectId}`, {
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
      return;
    }

    // Add from pool: clone into this curriculum (POST new subject).
    if (!poolSubject) return;
    try {
      const { data: newSubject } = await apiClient.post<SubjectForPool>("/subjects", {
        code: poolSubject.code,
        name: poolSubject.name,
        units: poolSubject.units,
        isLab: poolSubject.isLab,
        lecUnits: poolSubject.lecUnits,
        labUnits: poolSubject.labUnits,
        curriculumId,
        yearLevel: yearLevel ?? undefined,
        semester: semester ?? undefined,
        departmentId: curriculum?.departmentId ?? undefined,
      });
      // Working on one specialization: the new subject belongs to it; otherwise it is common to all.
      let tagged: { id: string; name: string }[] = [];
      if (viewSpec) {
        try {
          await apiClient.put(`/curriculum/${curriculumId}/subjects/${newSubject.id}/specializations`, { specializationIds: [viewSpec.id] });
          tagged = [{ id: viewSpec.id, name: viewSpec.name }];
        } catch {
          toast.error(`Added, but could not tag it with ${viewSpec.name}.`);
        }
      }
      setCurriculumSubjects((prev) =>
        [
          ...prev,
          {
            id: newSubject.id,
            code: newSubject.code,
            name: newSubject.name,
            units: newSubject.units,
            isLab: newSubject.isLab,
            yearLevel,
            semester,
            specializations: tagged,
          },
        ].sort((a, b) => a.code.localeCompare(b.code))
      );
      setAllSubjects((prev) => [...prev, newSubject]);
      const where = isUngrouped ? "Ungrouped" : `Year ${yearLevel} — ${SEMESTER_LABELS[semester as 1 | 2 | 3] ?? ""}`;
      toast.success(tagged.length > 0 ? `Added to ${where} for ${tagged[0].name}` : `Added to ${where}`);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        toast.error("A subject with this code is already in this curriculum.");
      } else {
        toast.error("Failed to add subject. Data was reloaded.");
      }
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
          <div className="flex items-center gap-2">
<h1 className="text-2xl font-semibold text-foreground">
            Build curriculum — {curriculum.name}</h1>
<HelpTip>Drag subjects from the pool into a year and semester to add them. Drag a subject between semesters to move it, or back to the pool to remove it from the curriculum. With specializations, choose which one you are working on: subjects you add are made for it, and the tree shows what its classes take. Use Track on a subject to say which specializations take it.</HelpTip>
</div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3" data-testid="build-specializations">
        {specs.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-foreground-muted">
            Working on
            <select
              aria-label="Specialization view"
              value={view}
              onChange={(e) => setView(e.target.value)}
              className="rounded border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">All subjects (new ones are common)</option>
              <option value="common">Common subjects only</option>
              {specs.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.name}: common + its own (new ones are its own)</option>
              ))}
            </select>
          </label>
        )}
        <Button type="button" variant="secondary" onClick={() => setManagerOpen(true)}>
          {specs.length === 0 ? "Add specializations" : "Manage specializations"}
        </Button>
        {viewSpec && (
          <p className="text-xs text-foreground-muted">Subjects you drop into a semester are added for {viewSpec.name} only.</p>
        )}
      </div>

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
                        onEditSpecializations={specs.length > 0 ? setSpecSubject : undefined}
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
              onEditSpecializations={specs.length > 0 ? setSpecSubject : undefined}
            />
          </div>
        </div>
      </DndContext>

      {managerOpen && (
        <SpecializationsManager curriculum={curriculum} onClose={() => setManagerOpen(false)} onChanged={() => void loadData()} />
      )}
      {specSubject && (
        <SubjectSpecializationEditor
          curriculumId={curriculum.id}
          subject={specSubject}
          specializations={specs}
          onClose={() => setSpecSubject(null)}
          onSaved={() => void loadData()}
        />
      )}
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
      <div className="mb-3 flex items-center gap-1.5">
<h2 className="text-sm font-semibold text-foreground">
        Subject pool</h2>
<HelpTip>Subjects that are not part of this curriculum. Dropping a subject here removes it from the curriculum.</HelpTip>
</div>
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
