import { useDroppable } from "@dnd-kit/core";
import {
  GRID_HEADER_HEIGHT,
  HOUR_END,
  HOUR_START,
  SLOT_HEIGHT,
  hourToTimeString,
  timeStringToHour,
} from "./scheduleGridConstants";
import type { SubjectDragItem } from "./schedulerTypes";

export interface SlotDropPayload {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: SubjectDragItem;
}

/** Parse droppable id "slot-{dayOfWeek}-{hour}" to slot data. */
export function parseSlotId(id: string): { dayOfWeek: number; hour: number } | null {
  const m = /^slot-(\d+)-(\d+)$/.exec(id);
  if (!m) return null;
  return { dayOfWeek: Number(m[1]), hour: Number(m[2]) };
}

interface SlotCellProps {
  dayOfWeek: number;
  hour: number;
  hourStart: number;
}

function SlotCell({ dayOfWeek, hour, hourStart }: SlotCellProps) {
  const startTime = hourToTimeString(hour);
  const endTime = hourToTimeString(hour + 1);
  const id = `slot-${dayOfWeek}-${hour}`;
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { dayOfWeek, startTime, endTime },
  });
  return (
    <div
      ref={setNodeRef}
      className={`absolute left-0 right-0 border border-transparent transition-colors ${isOver ? "bg-primary/10 ring-1 ring-primary" : ""}`}
      style={{
        top: (hour - hourStart) * SLOT_HEIGHT,
        height: SLOT_HEIGHT,
      }}
      aria-label={`Drop slot ${startTime} day ${dayOfWeek}`}
    />
  );
}

/** Pending assignment from a drop: show a temporary block until user saves or cancels. */
export interface PendingAssignmentBlock {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectName?: string;
}

interface ScheduleSlotOverlayProps {
  /** When true, overlay receives pointer events for drop; when false, clicks pass through to grid. */
  active?: boolean;
  /** Subject being dragged — when set with overSlotId, show a ghost in that slot. */
  activeDragItem?: SubjectDragItem | null;
  /** Droppable id of the slot under the cursor (e.g. "slot-1-8"). */
  overSlotId?: string | null;
  /** When set, show a temporary "pending" block in this slot while assignment form is open. */
  pendingAssignment?: PendingAssignmentBlock | null;
  /** Hour range (must match ScheduleGrid). Defaults from scheduleGridConstants. */
  hourStart?: number;
  hourEnd?: number;
  className?: string;
}

/**
 * Overlay grid of droppable slot cells. Must be positioned over the body of ScheduleGrid
 * (same dimensions: 7 columns, body height). Parent handles onDragEnd, parses over.id with
 * parseSlotId, gets active.data.current as SubjectDragItem, and invokes onSlotDrop.
 */
export function ScheduleSlotOverlay({
  active = false,
  activeDragItem = null,
  overSlotId = null,
  pendingAssignment = null,
  hourStart: hourStartProp,
  hourEnd: hourEndProp,
  className,
}: ScheduleSlotOverlayProps) {
  const hourStart = hourStartProp ?? HOUR_START;
  const hourEnd = hourEndProp ?? HOUR_END;
  const bodyHeight = (hourEnd - hourStart) * SLOT_HEIGHT;
  const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i);
  const overSlot = overSlotId ? parseSlotId(overSlotId) : null;
  const showGhost = active && activeDragItem && overSlot;

  const pendingStartHour = pendingAssignment ? timeStringToHour(pendingAssignment.startTime) : NaN;
  const pendingEndHour = pendingAssignment ? timeStringToHour(pendingAssignment.endTime) : NaN;
  const pendingValid =
    pendingAssignment &&
    !Number.isNaN(pendingStartHour) &&
    !Number.isNaN(pendingEndHour) &&
    pendingEndHour > pendingStartHour;

  return (
    <div
      className={`absolute left-0 grid min-w-[800px] ${active ? "pointer-events-auto" : "pointer-events-none"} ${className ?? ""}`}
      style={{
        top: GRID_HEADER_HEIGHT,
        gridTemplateColumns: "4.5rem repeat(6, 1fr)",
        gridTemplateRows: `${bodyHeight}px`,
        height: bodyHeight,
      }}
      aria-hidden
    >
      <div />
      {[1, 2, 3, 4, 5, 6].map((dayOfWeek) => (
        <div key={dayOfWeek} className="relative">
          {hours.map((hour) => (
            <SlotCell key={hour} dayOfWeek={dayOfWeek} hour={hour} hourStart={hourStart} />
          ))}
          {/* Ghost: temporary preview when dragging over this column */}
          {showGhost && overSlot.dayOfWeek === dayOfWeek && (
            <div
              className="absolute left-0.5 right-0.5 rounded border-2 border-primary border-dashed bg-primary/15 pointer-events-none flex items-center justify-center px-1 py-0.5"
              style={{
                top: (overSlot.hour - hourStart) * SLOT_HEIGHT + 2,
                height: SLOT_HEIGHT - 4,
              }}
            >
              <span className="text-xs font-medium truncate text-foreground">{activeDragItem.code}</span>
            </div>
          )}
          {/* Pending: temporary block after drop while assignment form is open */}
          {pendingValid && pendingAssignment.dayOfWeek === dayOfWeek && (
            <div
              className="absolute left-0.5 right-0.5 rounded border-2 border-primary border-dashed bg-primary-muted pointer-events-none flex flex-col items-center justify-center px-1 py-0.5 overflow-hidden"
              style={{
                top: (pendingStartHour - hourStart) * SLOT_HEIGHT + 2,
                height: (pendingEndHour - pendingStartHour) * SLOT_HEIGHT - 4,
              }}
            >
              <span className="text-xs font-medium truncate text-foreground w-full text-center">
                {pendingAssignment.subjectCode}
              </span>
              <span className="text-[10px] text-foreground-muted truncate w-full text-center">Pending</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
