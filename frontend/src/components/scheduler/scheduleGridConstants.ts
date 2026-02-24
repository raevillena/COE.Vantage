/** Must match ScheduleGrid so the slot overlay aligns. */
export const HOUR_START = 7;
export const HOUR_END = 21;
export const SLOT_HEIGHT = 44;

export const GRID_BODY_HEIGHT = (HOUR_END - HOUR_START) * SLOT_HEIGHT;

/** Approximate header row height so overlay can align below it. */
export const GRID_HEADER_HEIGHT = 48;

export function hourToTimeString(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
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
