function toMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** "13:30" -> "1:30 PM"; 12:00 AM is midnight and 12:00 PM is noon. */
function format12(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const mm = String(minutes % 60).padStart(2, "0");
  return `${h24 % 12 || 12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
}

interface Props {
  startTime: string;
  endTime: string;
  /** Called with a replacement end time ("HH:MM") when the user accepts the suggested fix. */
  onFixEnd?: (time: string) => void;
}

/**
 * Warns when the end time is not after the start time, which usually means AM and PM were mixed up
 * (for example 12:00 AM, midnight, typed for 12:00 PM, noon). Offers the PM time when that would fix it.
 */
export function TimeRangeWarning({ startTime, endTime, onFixEnd }: Props) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start == null || end == null || end > start) return null;

  // Same clock time 12 hours later (12:30 AM -> 12:30 PM, 1:00 AM -> 1:00 PM) when that lands after the start.
  const pm = end < 12 * 60 && end + 12 * 60 > start ? end + 12 * 60 : null;
  const hh = pm != null ? String(Math.floor(pm / 60)).padStart(2, "0") : "";
  const fix = pm != null ? `${hh}:${String(pm % 60).padStart(2, "0")}` : null;

  return (
    <div role="alert" className="rounded border border-warning bg-warning-muted px-3 py-2 text-sm text-warning">
      <p>
        {end === start
          ? `The block starts and ends at ${format12(start)}, so it has no length.`
          : `The end time (${format12(end)}) is before the start time (${format12(start)}), so the block would have a negative length.`}{" "}
        Check AM and PM: 12:00 AM is midnight and 12:00 PM is noon.
      </p>
      {fix && onFixEnd && (
        <button
          type="button"
          onClick={() => onFixEnd(fix)}
          className="mt-1 rounded font-medium underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-focus-ring"
        >
          Set the end time to {format12(pm!)}
        </button>
      )}
    </div>
  );
}
