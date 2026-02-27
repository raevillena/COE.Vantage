import { useDroppable } from "@dnd-kit/core";
import {
  GRID_HEADER_HEIGHT,
  GRID_BORDER_WIDTH,
  HOUR_END,
  HOUR_START,
  SLOT_HEIGHT,
  hourToTimeString,
  minutesToTimeString,
  timeToMinutes,
} from "./scheduleGridConstants";
import type { SubjectDragItem } from "./schedulerTypes";

export interface SlotDropPayload {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: SubjectDragItem;
}

/** Quarter of hour: 0 = :00, 1 = :15, 2 = :30, 3 = :45. */
export type SlotQuarter = 0 | 1 | 2 | 3;

/** Parse droppable id "slot-{dayOfWeek}-{hour}-{quarter}" (15-min) or legacy "slot-{dayOfWeek}-{hour}". */
export function parseSlotId(id: string): { dayOfWeek: number; hour: number; quarter: SlotQuarter } | null {
  const withQuarter = /^slot-(\d+)-(\d+)-(\d+)$/.exec(id);
  if (withQuarter) {
    const q = Number(withQuarter[3]);
    if (q < 0 || q > 3) return null;
    return { dayOfWeek: Number(withQuarter[1]), hour: Number(withQuarter[2]), quarter: q as SlotQuarter };
  }
  const legacy = /^slot-(\d+)-(\d+)$/.exec(id);
  if (!legacy) return null;
  return { dayOfWeek: Number(legacy[1]), hour: Number(legacy[2]), quarter: 0 };
}

/** Start time in 15-min from slot (hour + quarter). */
export function slotStartTime(slot: { hour: number; quarter: SlotQuarter }): string {
  return minutesToTimeString(slot.hour * 60 + slot.quarter * 15);
}

const SLOT_QUARTER_HEIGHT = SLOT_HEIGHT / 4;

interface SlotCellProps {
  dayOfWeek: number;
  hour: number;
  quarter: SlotQuarter;
  hourStart: number;
}

function SlotCell({ dayOfWeek, hour, quarter, hourStart }: SlotCellProps) {
  const startTime = slotStartTime({ hour, quarter });
  const endTime = quarter < 3 ? slotStartTime({ hour, quarter: (quarter + 1) as SlotQuarter }) : hourToTimeString(hour + 1);
  const id = `slot-${dayOfWeek}-${hour}-${quarter}`;
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { dayOfWeek, startTime, endTime },
  });
  const top = (hour - hourStart) * SLOT_HEIGHT + quarter * SLOT_QUARTER_HEIGHT;
  return (
    <div
      ref={setNodeRef}
      className={`absolute left-0 right-0 border border-transparent transition-colors ${isOver ? "bg-primary/10 ring-1 ring-primary" : ""}`}
      style={{
        top,
        height: SLOT_QUARTER_HEIGHT,
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
  /** Called when user drags the pending block to a new time (same day). */
  onPendingMove?: (payload: { dayOfWeek: number; startTime: string; endTime: string }) => void;
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
  onPendingMove,
  hourStart: hourStartProp,
  hourEnd: hourEndProp,
  className,
}: ScheduleSlotOverlayProps) {
  const hourStart = hourStartProp ?? HOUR_START;
  const hourEnd = hourEndProp ?? HOUR_END;
  const bodyHeight = (hourEnd - hourStart) * SLOT_HEIGHT;
  const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i);
  const quarters: SlotQuarter[] = [0, 1, 2, 3];
  const overSlot = overSlotId ? parseSlotId(overSlotId) : null;
  const showGhost = active && activeDragItem && overSlot;

  const pendingStartMinutes = pendingAssignment ? timeToMinutes(pendingAssignment.startTime) : NaN;
  const pendingEndMinutes = pendingAssignment ? timeToMinutes(pendingAssignment.endTime) : NaN;
  const pendingValid =
    pendingAssignment &&
    !Number.isNaN(pendingStartMinutes) &&
    !Number.isNaN(pendingEndMinutes) &&
    pendingEndMinutes > pendingStartMinutes;

  const pendingDurationMinutes = pendingValid ? pendingEndMinutes - pendingStartMinutes : 0;
  const topOffset = GRID_HEADER_HEIGHT + GRID_BORDER_WIDTH;
  const enablePointerEvents = active || Boolean(pendingValid);
  return (
    <div
      className={`absolute z-10 grid min-w-[800px] ${enablePointerEvents ? "pointer-events-auto" : "pointer-events-none"} ${className ?? ""}`}
      style={{
        left: GRID_BORDER_WIDTH,
        top: topOffset,
        width: `calc(100% - ${GRID_BORDER_WIDTH * 2}px)`,
        gridTemplateColumns: "4.5rem repeat(6, 1fr)",
        gridTemplateRows: `${bodyHeight}px`,
        height: bodyHeight,
      }}
      aria-hidden
    >
      <div />
      {[1, 2, 3, 4, 5, 6].map((dayOfWeek) => (
        <div key={dayOfWeek} className="relative">
          {hours.flatMap((hour) =>
            quarters.map((quarter) => (
              <SlotCell
                key={`${hour}-${quarter}`}
                dayOfWeek={dayOfWeek}
                hour={hour}
                quarter={quarter}
                hourStart={hourStart}
              />
            ))
          )}
          {/* Ghost: temporary preview when dragging over this column (1hr block at 15-min slot) */}
          {showGhost && overSlot.dayOfWeek === dayOfWeek && (
            <div
              className="absolute left-0.5 right-0.5 rounded border-2 border-primary border-dashed bg-primary/15 pointer-events-none flex items-center justify-center px-1 py-0.5"
              style={{
                top: (overSlot.hour - hourStart) * SLOT_HEIGHT + overSlot.quarter * SLOT_QUARTER_HEIGHT + 2,
                height: SLOT_HEIGHT - 4,
              }}
            >
              <span className="text-xs font-medium truncate text-foreground">{activeDragItem.code}</span>
            </div>
          )}
          {/* Pending: temporary block after drop while assignment form is open */}
          {pendingValid && pendingAssignment.dayOfWeek === dayOfWeek && (
            <div
              className="absolute left-0.5 right-0.5 rounded border-2 border-primary border-dashed bg-primary-muted flex flex-col items-center justify-center px-1 py-0.5 overflow-hidden cursor-grab active:cursor-grabbing"
              style={{
                top: (pendingStartMinutes - hourStart * 60) * (SLOT_HEIGHT / 60) + 2,
                height: (pendingEndMinutes - pendingStartMinutes) * (SLOT_HEIGHT / 60) - 4,
              }}
              onMouseDown={(e) => {
                if (!pendingValid || !onPendingMove) return;
                e.preventDefault();
                e.stopPropagation();
                const column = e.currentTarget.parentElement as HTMLElement | null;
                const root = column?.parentElement as HTMLElement | null;
                if (!column || !root) return;
                const dayColumns = Array.from(root.children).slice(1) as HTMLElement[];
                if (!dayColumns.length) return;
                const firstRect = dayColumns[0].getBoundingClientRect();
                const gridStartMinutes = hourStart * 60;
                const gridEndMinutes = hourEnd * 60;

                const resolveColumn = (clientX: number) => {
                  let chosen = dayColumns[0];
                  for (const col of dayColumns) {
                    const rect = col.getBoundingClientRect();
                    if (clientX >= rect.left && clientX <= rect.right) return col;
                    if (clientX < rect.left) return col;
                    chosen = col;
                  }
                  return chosen;
                };

                const computePosition = (clientX: number, clientY: number) => {
                  const targetColumn = resolveColumn(clientX);
                  const rect = targetColumn.getBoundingClientRect();
                  const relY = clientY - rect.top;
                  const minutesFromStart = (relY / SLOT_HEIGHT) * 60;
                  const snapped = Math.round(minutesFromStart / 15) * 15;
                  let newStart = gridStartMinutes + snapped;
                  // Keep same duration, clamp inside grid.
                  if (newStart < gridStartMinutes) newStart = gridStartMinutes;
                  if (newStart + pendingDurationMinutes > gridEndMinutes) {
                    newStart = gridEndMinutes - pendingDurationMinutes;
                  }
                  const newEnd = newStart + pendingDurationMinutes;
                  const dayIndex = dayColumns.indexOf(targetColumn);
                  const newDayOfWeek = dayIndex >= 0 ? dayIndex + 1 : pendingAssignment.dayOfWeek;
                  return { newDayOfWeek, newStart, newEnd };
                };

                const handleMove = (moveEvent: MouseEvent) => {
                  const { newDayOfWeek, newStart, newEnd } = computePosition(
                    moveEvent.clientX,
                    moveEvent.clientY
                  );
                  onPendingMove({
                    dayOfWeek: newDayOfWeek,
                    startTime: minutesToTimeString(newStart),
                    endTime: minutesToTimeString(newEnd),
                  });
                };

                const handleUp = (upEvent: MouseEvent) => {
                  window.removeEventListener("mousemove", handleMove);
                  window.removeEventListener("mouseup", handleUp);
                  const { newDayOfWeek, newStart, newEnd } = computePosition(
                    upEvent.clientX,
                    upEvent.clientY
                  );
                  onPendingMove({
                    dayOfWeek: newDayOfWeek,
                    startTime: minutesToTimeString(newStart),
                    endTime: minutesToTimeString(newEnd),
                  });
                };

                window.addEventListener("mousemove", handleMove);
                window.addEventListener("mouseup", handleUp);
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
