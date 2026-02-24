import { useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { FacultyLoad } from "../../types/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_START = 7;
const HOUR_END = 21;
/** Row height per hour so two lines (subject + room) fit without being cut off */
const SLOT_HEIGHT = 44;

/** Format hour (0–23) as 12-hour time e.g. "8:00 AM", "12:00 PM" */
function formatHour12(hour24: number): string {
  const h = hour24 % 12 || 12;
  const ampm = hour24 < 12 ? "AM" : "PM";
  return `${h}:00 ${ampm}`;
}

/** Format full name as "FirstInitial. Surname" e.g. "Maria Santos" → "M. Santos". */
function formatFacultyShortName(name: string | undefined): string {
  if (!name || !name.trim()) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const surname = parts[parts.length - 1];
  return `${first.charAt(0).toUpperCase()}. ${surname}`;
}

/** Format time string as 12-hour e.g. "8:00 AM" for tooltips (uses same parsing as grid). */
function formatTime12(time: string): string {
  const mins = timeToMinutes(time);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hour = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

const COLORS = ["bg-blue-200", "bg-emerald-200", "bg-amber-200", "bg-violet-200", "bg-rose-200", "bg-cyan-200"];

function colorClass(subjectId: string, ids: string[]) {
  const i = ids.indexOf(subjectId);
  return COLORS[i % COLORS.length] ?? "bg-primary-muted";
}

/** Parse "HH:mm" or "HH:mm:ss" to minutes since midnight. Handles ISO-ish strings by taking only the time part. */
function timeToMinutes(time: string): number {
  if (!time || typeof time !== "string") return 0;
  const normalized = time.trim();
  const timePart = normalized.includes("T") ? normalized.split("T")[1] ?? normalized : normalized;
  const parts = timePart.split(":").map((p) => parseInt(p, 10));
  const h = Number.isNaN(parts[0]) ? 0 : Math.min(23, Math.max(0, parts[0]));
  const m = Number.isNaN(parts[1]) ? 0 : Math.min(59, Math.max(0, parts[1]));
  return h * 60 + m;
}

function hourToTimeString(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function overlaps(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }): boolean {
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Assign each load a lane index so that overlapping loads never share a lane.
 * Lanes are laid out as separate columns, so this prevents any visual overlap.
 */
function assignLanes(dayLoads: FacultyLoad[]): Map<string, number> {
  const sorted = [...dayLoads].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
  const laneByLoadId = new Map<string, number>();
  const lanes: FacultyLoad[][] = [];

  for (const load of sorted) {
    let lane = 0;
    while (lane < lanes.length) {
      const hasOverlap = lanes[lane].some((existing) => overlaps(load, existing));
      if (!hasOverlap) break;
      lane++;
    }
    if (lane === lanes.length) lanes.push([]);
    lanes[lane].push(load);
    laneByLoadId.set(load.id, lane);
  }
  return laneByLoadId;
}

interface ScheduleBlockProps {
  load: FacultyLoad;
  subjectIds: string[];
  timeToPx: (time: string) => number;
  isConflict: boolean;
  selected: boolean;
  hourStart: number;
  hourEnd: number;
  onLoadClick?: (load: FacultyLoad) => void;
  onLoadMove?: (load: FacultyLoad, payload: LoadMovePayload) => void;
  onLoadResize?: (load: FacultyLoad, payload: LoadResizePayload) => void;
}

function ScheduleBlock({
  load,
  subjectIds,
  timeToPx,
  isConflict,
  selected,
  hourStart,
  hourEnd,
  onLoadClick,
  onLoadMove,
  onLoadResize,
}: ScheduleBlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `load-${load.id}`,
    data: { type: "load" as const, load },
    disabled: !onLoadMove,
  });

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const column = (e.target as HTMLElement).closest("[data-day-column]") as HTMLElement | null;
      if (!column || !onLoadResize) return;
      const startHour = Math.floor(timeToMinutes(load.startTime) / 60);

      const onMouseUp = (upEvent: MouseEvent) => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        const rect = column.getBoundingClientRect();
        const relY = upEvent.clientY - rect.top;
        const slotIndex = Math.round(relY / SLOT_HEIGHT);
        const newEndHour = Math.max(startHour + 1, Math.min(hourEnd, hourStart + slotIndex));
        const newEndTime = hourToTimeString(newEndHour);
        if (newEndTime !== load.endTime) {
          onLoadResize(load, { startTime: load.startTime, endTime: newEndTime });
        }
      };

      const onMouseMove = () => {
        // Optional: could show live preview; for now we only apply on mouseup
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [load, hourStart, hourEnd, onLoadResize]
  );

  const startPx = timeToPx(load.startTime);
  const endPx = timeToPx(load.endTime);
  const durationPxVal = endPx - startPx;
  const top = startPx + 1;
  const height = Math.max(20, durationPxVal - 2);
  const timeTooltip = `${formatTime12(load.startTime)} – ${formatTime12(load.endTime)}`;
  const facultyShort = formatFacultyShortName(load.faculty?.name);
  const titleParts = [load.subject?.code ?? "—", load.room?.name ?? "", facultyShort, timeTooltip].filter(Boolean);

  return (
    <div
      ref={setNodeRef}
      {...(onLoadMove ? { ...attributes, ...listeners } : {})}
      role={onLoadClick ? "button" : undefined}
      tabIndex={onLoadClick ? 0 : undefined}
      onClick={onLoadClick ? (e) => { if (!(e.target as HTMLElement).closest("[data-resize-handle]")) onLoadClick(load); } : undefined}
      onKeyDown={onLoadClick ? (e) => e.key === "Enter" && onLoadClick(load) : undefined}
      title={titleParts.join(" · ")}
      className={`absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-xs overflow-hidden min-w-0 box-border ${colorClass(load.subjectId, subjectIds)} ${load.subject?.isLab ? "border-2 border-dashed border-foreground-muted" : ""} ${isConflict ? "!bg-danger/20 ring-1 ring-danger" : ""} ${selected ? "ring-2 ring-primary" : ""} ${onLoadClick ? "cursor-pointer" : ""} ${onLoadMove ? "cursor-grab active:cursor-grabbing" : ""} ${isDragging ? "opacity-50" : ""}`}
      style={{ top, height }}
    >
      <div className="font-medium truncate min-w-0">
        {[load.subject?.code ?? "—", load.room?.name].filter(Boolean).join(" · ")}
      </div>
      {facultyShort ? <div className="truncate min-w-0 text-foreground-muted text-[10px]">{facultyShort}</div> : null}
      {onLoadResize && height >= 24 && (
        <div
          data-resize-handle
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize border-t border-white/30 hover:bg-white/20"
          onMouseDown={handleResizeMouseDown}
          aria-label="Resize time"
        />
      )}
    </div>
  );
}

/** New time slot when moving a load (e.g. drop on slot). */
export interface LoadMovePayload {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/** New time range when resizing a load. */
export interface LoadResizePayload {
  startTime: string;
  endTime: string;
}

interface ScheduleGridProps {
  loads: FacultyLoad[];
  conflictLoadIds?: Set<string>;
  selectedLoadId?: string | null;
  readOnly?: boolean;
  /** When false, only the grid is rendered (no overflow wrapper); use when embedding in a custom scroll/overlay layout. */
  wrapInScroll?: boolean;
  /** Called when a schedule block is clicked (e.g. to edit in right pane). */
  onLoadClick?: (load: FacultyLoad) => void;
  /** When set, blocks are draggable to move to another slot; called with load and new slot. */
  onLoadMove?: (load: FacultyLoad, payload: LoadMovePayload) => void;
  /** When set, blocks show a resize handle; called with load and new start/end time. */
  onLoadResize?: (load: FacultyLoad, payload: LoadResizePayload) => void;
  /** Optional time range so the grid only shows these hours (e.g. compact preview with no empty rows). */
  hourStart?: number;
  hourEnd?: number;
}

export function ScheduleGrid({
  loads,
  conflictLoadIds = new Set(),
  selectedLoadId = null,
  wrapInScroll = true,
  onLoadClick,
  onLoadMove,
  onLoadResize,
  hourStart: hourStartProp,
  hourEnd: hourEndProp,
}: ScheduleGridProps) {
  const subjectIds = [...new Set(loads.map((l) => l.subjectId))];
  const hourStart = hourStartProp ?? HOUR_START;
  const hourEnd = hourEndProp ?? HOUR_END;
  const gridHeight = (hourEnd - hourStart) * SLOT_HEIGHT;

  const timeToPx = (time: string) => (timeToMinutes(time) - hourStart * 60) * (SLOT_HEIGHT / 60);

  const gridEl = (
    <div className="grid min-w-[800px] rounded border border-border bg-surface" style={{ gridTemplateColumns: "4.5rem repeat(6, 1fr)", gridTemplateRows: `auto ${gridHeight}px` }}>
        {/* Header row: time label + weekday headers */}
        <div className="border-b border-border bg-surface-muted p-2 font-medium text-foreground-muted" />
        {DAYS.map((d) => (
          <div key={d} className="border-b border-l border-border bg-surface-muted p-2 text-center font-medium text-foreground">{d}</div>
        ))}
        {/* Body: single row with time column + 6 day columns so columns align with header */}
        <div className="relative border-r border-border" style={{ height: gridHeight, gridColumn: "1" }}>
          {Array.from({ length: hourEnd - hourStart }, (_, i) => (
            <div key={i} className="absolute left-0 flex w-[4.5rem] items-center justify-center border-t border-border text-xs text-foreground-muted" style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}>{formatHour12(hourStart + i)}</div>
          ))}
        </div>
        {[1, 2, 3, 4, 5, 6].map((dayOfWeek) => {
          const dayLoads = loads.filter((l) => l.dayOfWeek === dayOfWeek);
          const laneMap = assignLanes(dayLoads);
          const numLanes = dayLoads.length ? Math.max(...Array.from(laneMap.values())) + 1 : 1;
          const loadsByLane: FacultyLoad[][] = Array.from({ length: numLanes }, () => []);
          for (const load of dayLoads) {
            const lane = laneMap.get(load.id) ?? 0;
            loadsByLane[lane].push(load);
          }
          return (
            <div
              key={dayOfWeek}
              data-day-column
              data-hour-start={hourStart}
              className="grid border-r border-border gap-x-0.5"
              style={{
                height: gridHeight,
                gridColumn: dayOfWeek + 1,
                gridTemplateColumns: `repeat(${numLanes}, 1fr)`,
              }}
            >
              {loadsByLane.map((laneLoads, laneIndex) => (
                <div key={laneIndex} className="relative min-w-0 overflow-hidden">
                  {laneLoads.map((load) => (
                    <ScheduleBlock
                      key={load.id}
                      load={load}
                      subjectIds={subjectIds}
                      timeToPx={timeToPx}
                      isConflict={conflictLoadIds.has(load.id)}
                      selected={selectedLoadId === load.id}
                      hourStart={hourStart}
                      hourEnd={hourEnd}
                      onLoadClick={onLoadClick}
                      onLoadMove={onLoadMove}
                      onLoadResize={onLoadResize}
                    />
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
  );
  return wrapInScroll ? <div className="overflow-x-auto">{gridEl}</div> : gridEl;
}
