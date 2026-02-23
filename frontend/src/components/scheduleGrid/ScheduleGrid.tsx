import type { FacultyLoad } from "../../types/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_START = 7;
const HOUR_END = 21;
const SLOT_HEIGHT = 32;

const COLORS = ["bg-blue-200", "bg-emerald-200", "bg-amber-200", "bg-violet-200", "bg-rose-200", "bg-cyan-200"];

function colorClass(subjectId: string, ids: string[]) {
  const i = ids.indexOf(subjectId);
  return COLORS[i % COLORS.length] ?? "bg-slate-200";
}

interface ScheduleGridProps {
  loads: FacultyLoad[];
  conflictLoadIds?: Set<string>;
  selectedLoadId?: string | null;
  readOnly?: boolean;
}

export function ScheduleGrid({ loads, conflictLoadIds = new Set(), selectedLoadId = null }: ScheduleGridProps) {
  const subjectIds = [...new Set(loads.map((l) => l.subjectId))];
  const gridHeight = (HOUR_END - HOUR_START) * SLOT_HEIGHT;

  const timeToPx = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return ((h - HOUR_START) * 60 + m) * (SLOT_HEIGHT / 60);
  };
  const durationPx = (start: string, end: string) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return ((eh - sh) * 60 + (em - sm)) * (SLOT_HEIGHT / 60);
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px] rounded border border-slate-200 bg-white">
        <div className="grid grid-cols-[60px_repeat(6,1fr)] border-b border-slate-200 bg-slate-50">
          <div className="p-2 font-medium text-slate-600" />
          {DAYS.map((d) => (
            <div key={d} className="p-2 text-center font-medium text-slate-700 border-l border-slate-200">{d}</div>
          ))}
        </div>
        <div className="relative" style={{ height: gridHeight }}>
          {[1, 2, 3, 4, 5, 6].map((dayOfWeek) => (
            <div
              key={dayOfWeek}
              className="absolute border-l border-slate-200"
              style={{ left: 60 + (dayOfWeek - 1) * ((800 - 60) / 6), width: (800 - 60) / 6 - 1, height: gridHeight }}
            >
              {loads.filter((l) => l.dayOfWeek === dayOfWeek).map((load) => {
                const top = timeToPx(load.startTime);
                const height = Math.max(durationPx(load.startTime, load.endTime), 20);
                const isConflict = conflictLoadIds.has(load.id);
                const selected = selectedLoadId === load.id;
                return (
                  <div
                    key={load.id}
                    className={`absolute left-1 right-1 rounded px-1 py-0.5 text-xs ${colorClass(load.subjectId, subjectIds)} ${load.subject?.isLab ? "border-2 border-dashed border-slate-500" : ""} ${isConflict ? "bg-red-300" : ""} ${selected ? "ring-2 ring-slate-800" : ""}`}
                    style={{ top: top + 2, height: height - 4 }}
                  >
                    <div className="font-medium truncate">{load.subject?.code ?? "—"}</div>
                    <div className="truncate">{load.room?.name ?? ""}</div>
                  </div>
                );
              })}
            </div>
          ))}
          {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
            <div key={i} className="absolute left-0 w-14 text-xs text-slate-500 border-t border-slate-100" style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}>{HOUR_START + i}:00</div>
          ))}
        </div>
      </div>
    </div>
  );
}
