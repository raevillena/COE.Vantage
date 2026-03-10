import { useCallback, useState, useEffect } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import type { Subject } from "../../types/api";

/** Faculty item from GET /users?role=FACULTY (includes department for grouping). */
export interface FacultyWithDepartment {
  id: string;
  name: string;
  email: string;
  departmentId?: string | null;
  department?: { name: string; code: string | null } | null;
}

export interface PrioritizedFacultyItem {
  facultyId: string;
  name: string;
  email: string;
  priority: number;
}

const DROP_ID_POOL = "priority-faculty-pool";
const DROP_ID_SEQUENCE = "priority-faculty-sequence";

type FacultyDragData =
  | { source: "pool"; facultyId: string; name: string; email: string }
  | { source: "priority"; facultyId: string; name: string; email: string };

/** Draggable faculty chip in the pool (left panel). */
function DraggablePoolFaculty({
  faculty,
  isInPriority,
}: {
  faculty: FacultyWithDepartment;
  isInPriority: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-${faculty.id}`,
    data: {
      source: "pool",
      facultyId: faculty.id,
      name: faculty.name,
      email: faculty.email,
    } satisfies FacultyDragData,
    disabled: isInPriority,
  });
  if (isInPriority) return null;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 rounded border border-border bg-surface px-2 py-1.5 text-sm text-foreground cursor-grab active:cursor-grabbing hover:bg-surface-muted ${isDragging ? "opacity-50" : ""}`}
    >
      <span className="font-medium truncate">{faculty.name}</span>
      <span className="truncate text-foreground-muted text-xs">{faculty.email}</span>
    </div>
  );
}

/** Sortable row in the priority sequence (right panel). */
function SortablePriorityRow({
  item,
  index,
  onRemove,
}: {
  item: PrioritizedFacultyItem;
  index: number;
  onRemove: (facultyId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.facultyId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded border border-border bg-surface-muted px-2 py-1.5 text-sm text-foreground cursor-grab active:cursor-grabbing hover:bg-surface ${isDragging ? "opacity-50 shadow-md" : ""}`}
      {...attributes}
      {...listeners}
    >
      <span className="w-5 text-foreground-muted font-medium">{index + 1}.</span>
      <span className="font-medium truncate flex-1">{item.name}</span>
      <span className="truncate text-foreground-muted text-xs">{item.email}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.facultyId);
        }}
        className="ml-1 rounded p-1 text-foreground-muted hover:bg-danger-muted hover:text-danger focus:outline-none focus:ring-1 focus:ring-focus-ring"
        aria-label="Remove from priority"
      >
        ×
      </button>
    </div>
  );
}

interface PrioritizedFacultyModalProps {
  subject: Subject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPriorityList: PrioritizedFacultyItem[];
  allFaculty: FacultyWithDepartment[];
  onSave: (facultyIds: string[]) => Promise<void>;
  saving: boolean;
  loading: boolean;
}

/** Group faculty by department for the left panel. */
function groupFacultyByDepartment(
  faculty: FacultyWithDepartment[]
): { departmentId: string; departmentName: string; members: FacultyWithDepartment[] }[] {
  const map = new Map<string, { departmentName: string; members: FacultyWithDepartment[] }>();
  const noDept = "none";
  map.set(noDept, { departmentName: "No department", members: [] });
  for (const f of faculty) {
    const key = f.departmentId ?? noDept;
    if (!map.has(key)) {
      map.set(key, {
        departmentName: f.department?.name ?? "No department",
        members: [],
      });
    }
    map.get(key)!.members.push(f);
  }
  return Array.from(map.entries()).map(([departmentId, { departmentName, members }]) => ({
    departmentId,
    departmentName,
    members: members.sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export function PrioritizedFacultyModal({
  subject,
  open,
  onOpenChange,
  initialPriorityList,
  allFaculty,
  onSave,
  saving,
  loading,
}: PrioritizedFacultyModalProps) {
  const [priorityList, setPriorityList] = useState<PrioritizedFacultyItem[]>(initialPriorityList);
  const [overId, setOverId] = useState<string | null>(null);

  // Sync local state when modal opens or initial data changes
  useEffect(() => {
    if (open) setPriorityList(initialPriorityList);
  }, [open, initialPriorityList]);

  const priorityIds = priorityList.map((p) => p.facultyId);
  const inPrioritySet = new Set(priorityIds);
  const poolFaculty = allFaculty.filter((f) => !inPrioritySet.has(f.id));
  const byDepartment = groupFacultyByDepartment(poolFaculty);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over?.id != null ? String(event.over.id) : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setOverId(null);
      const { active, over } = event;
      if (!over?.id) return;

      const overIdStr = String(over.id);
      const data = active.data.current as FacultyDragData | undefined;
      if (!data) return;

      // Dropping from pool onto the priority zone: add to end (or before over if over is a priority item)
      if (data.source === "pool") {
        const isOverSequence = overIdStr === DROP_ID_SEQUENCE || inPrioritySet.has(overIdStr);
        if (!isOverSequence) return;
        const faculty = allFaculty.find((f) => f.id === data.facultyId);
        if (!faculty || inPrioritySet.has(faculty.id)) return;
        const newItem: PrioritizedFacultyItem = {
          facultyId: faculty.id,
          name: faculty.name,
          email: faculty.email,
          priority: priorityList.length,
        };
        if (overIdStr !== DROP_ID_SEQUENCE && inPrioritySet.has(overIdStr)) {
          const idx = priorityList.findIndex((p) => p.facultyId === overIdStr);
          if (idx >= 0) {
            const next = [...priorityList];
            next.splice(idx, 0, newItem);
            setPriorityList(
              next.map((p, i) => ({ ...p, priority: i }))
            );
            return;
          }
        }
        setPriorityList((prev) => [...prev, { ...newItem, priority: prev.length }]);
        return;
      }

      // Dropping from priority onto pool: remove from list
      if (data.source === "priority" && overIdStr === DROP_ID_POOL) {
        setPriorityList((prev) =>
          prev
            .filter((p) => p.facultyId !== data.facultyId)
            .map((p, i) => ({ ...p, priority: i }))
        );
        return;
      }

      // Reorder within priority list (over is another priority item)
      if (data.source === "priority" && inPrioritySet.has(overIdStr) && data.facultyId !== overIdStr) {
        const oldIndex = priorityList.findIndex((p) => p.facultyId === data.facultyId);
        const newIndex = priorityList.findIndex((p) => p.facultyId === overIdStr);
        if (oldIndex === -1 || newIndex === -1) return;
        const reordered = arrayMove(
          priorityList.map((p) => p.facultyId),
          oldIndex,
          newIndex
        );
        const newList = reordered
          .map((id) => priorityList.find((p) => p.facultyId === id)!)
          .map((p, i) => ({ ...p, priority: i }));
        setPriorityList(newList);
      }
    },
    [allFaculty, inPrioritySet, priorityList]
  );

  const handleDragCancel = useCallback(() => setOverId(null), []);

  const removeFromPriority = useCallback((facultyId: string) => {
    setPriorityList((prev) =>
      prev
        .filter((p) => p.facultyId !== facultyId)
        .map((p, i) => ({ ...p, priority: i }))
    );
  }, []);

  const handleSave = useCallback(async () => {
    await onSave(priorityList.map((p) => p.facultyId));
    onOpenChange(false);
  }, [onSave, priorityList, onOpenChange]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setPriorityList(initialPriorityList);
      onOpenChange(next);
    },
    [initialPriorityList, onOpenChange]
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Content
        title={subject ? `Prioritized faculty — ${subject.code}` : "Prioritized faculty"}
        description="Drag faculty from the left (by department) into the right panel to set priority order. Auto-assign will use this order. You can reorder or remove via drag or the × button."
        className="!max-w-[min(56rem,95vw)] w-[95vw] max-h-[90vh] overflow-hidden flex flex-col"
      >
        {loading ? (
          <div className="flex justify-center py-12" aria-busy="true">
            <Spinner />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 min-h-0 overflow-hidden">
              {/* Left: faculty pool by department */}
              <div className="min-h-[280px] flex flex-col">
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  Faculty by department
                </h3>
                <p className="text-xs text-foreground-muted mb-2">
                  Drag into the priority panel to add. Faculty already in the list are hidden here.
                </p>
                <PoolDropZone
                  byDepartment={byDepartment}
                  allFaculty={allFaculty}
                  inPrioritySet={inPrioritySet}
                  isOver={overId === DROP_ID_POOL}
                />
              </div>

              {/* Right: priority sequence */}
              <div className="min-h-[280px] flex flex-col">
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  Priority sequence
                </h3>
                <p className="text-xs text-foreground-muted mb-2">
                  First = most preferred. Drag to reorder or back to the left to remove.
                </p>
                <PrioritySequenceDropZone
                  priorityList={priorityList}
                  onRemove={removeFromPriority}
                  isOver={overId === DROP_ID_SEQUENCE}
                />
              </div>
            </div>
          </DndContext>
        )}
        <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4">
          <Dialog.Close asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Dialog.Close>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** Left panel: droppable pool with faculty grouped by department. */
function PoolDropZone({
  byDepartment,
  allFaculty,
  inPrioritySet,
  isOver,
}: {
  byDepartment: { departmentId: string; departmentName: string; members: FacultyWithDepartment[] }[];
  allFaculty: FacultyWithDepartment[];
  inPrioritySet: Set<string>;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: DROP_ID_POOL });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 rounded border-2 border-dashed p-3 min-h-[200px] overflow-y-auto transition-colors ${isOver ? "border-primary bg-primary/10" : "border-border bg-surface-muted/20"}`}
    >
      {byDepartment.map(({ departmentId, departmentName, members }) => (
        <div key={departmentId} className="mb-3">
          <div className="text-xs font-semibold text-foreground-muted uppercase tracking-wide mb-1.5">
            {departmentName}
          </div>
          <div className="space-y-1">
            {members.length === 0 ? (
              <p className="text-xs text-foreground-muted">None</p>
            ) : (
              members.map((f) => (
                <DraggablePoolFaculty
                  key={f.id}
                  faculty={f}
                  isInPriority={inPrioritySet.has(f.id)}
                />
              ))
            )}
          </div>
        </div>
      ))}
      {allFaculty.length === 0 && (
        <p className="text-xs text-foreground-muted">No faculty in the system.</p>
      )}
    </div>
  );
}

/** Right panel: droppable priority list with sortable items. */
function PrioritySequenceDropZone({
  priorityList,
  onRemove,
  isOver,
}: {
  priorityList: PrioritizedFacultyItem[];
  onRemove: (facultyId: string) => void;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: DROP_ID_SEQUENCE });
  const ids = priorityList.map((p) => p.facultyId);
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 rounded border-2 border-dashed p-3 min-h-[200px] overflow-y-auto transition-colors ${isOver ? "border-primary bg-primary/10" : "border-border bg-surface-muted/20"}`}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {priorityList.length === 0 ? (
            <p className="text-sm text-foreground-muted py-4">Drop faculty here to set priority order.</p>
          ) : (
            priorityList.map((item, index) => (
              <SortablePriorityRow
                key={item.facultyId}
                item={item}
                index={index}
                onRemove={onRemove}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
