import type { FacultyLoad } from "../../types/api";
import {
  GRID_HEADER_HEIGHT,
  GRID_BORDER_WIDTH,
  HOUR_END,
  HOUR_START,
  SLOT_HEIGHT,
  timeToMinutes,
} from "./scheduleGridConstants";

interface AvailabilityOverlayProps {
  /** Loads for the selected faculty — shown as unavailable (faculty busy). */
  facultyLoads?: FacultyLoad[];
  /** Loads for the selected room — shown as unavailable (room in use). */
  roomLoads?: FacultyLoad[];
  /** Loads for the selected student class — shown as unavailable (class busy). */
  classLoads?: FacultyLoad[];
  hourStart?: number;
  hourEnd?: number;
  className?: string;
}

/**
 * Overlay on the main schedule grid showing when faculty or room is busy.
 * Faculty loads = one color (e.g. blue tint), room loads = another (e.g. amber tint),
 * so the user can see free slots for both.
 */
export function AvailabilityOverlay({
  facultyLoads = [],
  roomLoads = [],
  classLoads = [],
  hourStart: hourStartProp,
  hourEnd: hourEndProp,
  className,
}: AvailabilityOverlayProps) {
  const hourStart = hourStartProp ?? HOUR_START;
  const hourEnd = hourEndProp ?? HOUR_END;
  const bodyHeight = (hourEnd - hourStart) * SLOT_HEIGHT;
  const topOffset = GRID_HEADER_HEIGHT + GRID_BORDER_WIDTH;

  const timeToPx = (time: string) =>
    (timeToMinutes(time) - hourStart * 60) * (SLOT_HEIGHT / 60);

  const renderBlocks = (loads: FacultyLoad[], type: "faculty" | "room" | "class") => {
    const baseClass =
      type === "faculty"
        ? "bg-blue-500/25 ring-1 ring-blue-500/40"
        : type === "room"
        ? "bg-amber-500/25 ring-1 ring-amber-500/40"
        : "bg-emerald-500/25 ring-1 ring-emerald-500/40";
    return loads.map((load) => {
      const top = timeToPx(load.startTime) + 1;
      const height = Math.max(
        8,
        timeToPx(load.endTime) - timeToPx(load.startTime) - 2
      );
      return (
        <div
          key={`${type}-${load.id}`}
          className={`absolute left-0.5 right-0.5 rounded pointer-events-none ${baseClass}`}
          style={{ top, height }}
          title={
            type === "faculty"
              ? "Faculty has another class here"
              : type === "room"
              ? "Room in use here"
              : "Student class has another class here"
          }
          aria-hidden
        />
      );
    });
  };

  if (facultyLoads.length === 0 && roomLoads.length === 0 && classLoads.length === 0) return null;

  return (
    <div
      className={`absolute z-10 grid min-w-[800px] pointer-events-none ${className ?? ""}`}
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
          {renderBlocks(
            facultyLoads.filter((l) => l.dayOfWeek === dayOfWeek),
            "faculty"
          )}
          {renderBlocks(
            roomLoads.filter((l) => l.dayOfWeek === dayOfWeek),
            "room"
          )}
          {renderBlocks(
            classLoads.filter((l) => l.dayOfWeek === dayOfWeek),
            "class"
          )}
        </div>
      ))}
    </div>
  );
}
