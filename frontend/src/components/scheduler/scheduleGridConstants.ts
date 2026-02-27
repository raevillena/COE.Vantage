/** Must match ScheduleGrid so the slot overlay aligns. */
export const HOUR_START = 7;
export const HOUR_END = 21;
export const SLOT_HEIGHT = 44;

export const GRID_BODY_HEIGHT = (HOUR_END - HOUR_START) * SLOT_HEIGHT;

/** Header row height; must match ScheduleGrid HEADER_ROW_HEIGHT. */
export const GRID_HEADER_HEIGHT = 48;

/** Grid border width (ScheduleGrid has border border-border). Overlay insets by this to align. */
export const GRID_BORDER_WIDTH = 1;

export function hourToTimeString(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Parse "HH:mm" to total minutes from midnight. Returns 0 if invalid. */
export function timeToMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return 0;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return 0;
  return h * 60 + min;
}

/** Format minutes from midnight as "HH:mm". */
export function minutesToTimeString(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Parse "HH:mm" or "H:mm" to hour (0–23). Returns NaN if invalid. */
export function timeStringToHour(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return NaN;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (min !== 0) return NaN; // we only use whole hours for slot alignment
  return h >= 0 && h <= 23 ? h : NaN;
}
