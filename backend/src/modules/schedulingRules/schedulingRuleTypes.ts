/**
 * Config for a scheduling rule set (auto-schedule behavior).
 * Stored as JSON on SchedulingRuleSet.config.
 */
export interface SchedulingRuleSetConfig {
  /** Work day start in minutes from midnight (e.g. 480 = 08:00). */
  workStartMinutes: number;
  /** Work day end in minutes from midnight (e.g. 1020 = 17:00). */
  workEndMinutes: number;
  /** Lunch window start (e.g. 720 = 12:00). */
  lunchStartMinutes: number;
  /** Lunch window end (e.g. 780 = 13:00). */
  lunchEndMinutes: number;
  /** Slot step in minutes (e.g. 15). */
  slotStepMinutes: number;
  /** If true, avoid placing blocks that span the lunch window. */
  avoidLunchSpan: boolean;
  /** Prefer MWF (3×1hr) for 3-unit lectures when possible. */
  preferMwfFor3UnitLecture: boolean;
  /** Prefer TTh (2×1.5hr) for 3-unit lectures when possible. */
  preferTthFor3UnitLecture: boolean;
  /** Prefer random 3×1hr pattern across available days for 3-unit lectures when possible. */
  preferRandom3DayFor3UnitLecture: boolean;
  /** Require a break after long (≥3hr) labs so they are not back-to-back. */
  requireLabBreakAfterLongLab: boolean;
  /** Max length of a single block in minutes (e.g. 300 = 5 hr). */
  maxBlockMinutes: number;
  /** Day-of-week numbers to exclude from auto-schedule (1=Mon … 6=Sat). Standard rule: avoid Friday = [5]. */
  excludedDays: number[];
}

export const DEFAULT_SCHEDULING_CONFIG: SchedulingRuleSetConfig = {
  workStartMinutes: 8 * 60,   // 08:00
  workEndMinutes: 17 * 60,   // 17:00
  lunchStartMinutes: 12 * 60,
  lunchEndMinutes: 13 * 60,
  slotStepMinutes: 15,
  avoidLunchSpan: true,
  preferMwfFor3UnitLecture: true,
  preferTthFor3UnitLecture: false,
  preferRandom3DayFor3UnitLecture: false,
  requireLabBreakAfterLongLab: true,
  maxBlockMinutes: 300,
  excludedDays: [5], // standard: avoid Friday
};

export function normalizeConfig(raw: unknown): SchedulingRuleSetConfig {
  if (raw && typeof raw === "object" && "workStartMinutes" in raw) {
    const o = raw as Record<string, unknown>;
    return {
      workStartMinutes: typeof o.workStartMinutes === "number" ? o.workStartMinutes : DEFAULT_SCHEDULING_CONFIG.workStartMinutes,
      workEndMinutes: typeof o.workEndMinutes === "number" ? o.workEndMinutes : DEFAULT_SCHEDULING_CONFIG.workEndMinutes,
      lunchStartMinutes: typeof o.lunchStartMinutes === "number" ? o.lunchStartMinutes : DEFAULT_SCHEDULING_CONFIG.lunchStartMinutes,
      lunchEndMinutes: typeof o.lunchEndMinutes === "number" ? o.lunchEndMinutes : DEFAULT_SCHEDULING_CONFIG.lunchEndMinutes,
      slotStepMinutes: typeof o.slotStepMinutes === "number" ? o.slotStepMinutes : DEFAULT_SCHEDULING_CONFIG.slotStepMinutes,
      avoidLunchSpan: typeof o.avoidLunchSpan === "boolean" ? o.avoidLunchSpan : DEFAULT_SCHEDULING_CONFIG.avoidLunchSpan,
      preferMwfFor3UnitLecture:
        typeof o.preferMwfFor3UnitLecture === "boolean"
          ? o.preferMwfFor3UnitLecture
          : DEFAULT_SCHEDULING_CONFIG.preferMwfFor3UnitLecture,
      preferTthFor3UnitLecture:
        typeof o.preferTthFor3UnitLecture === "boolean"
          ? (o.preferTthFor3UnitLecture as boolean)
          : DEFAULT_SCHEDULING_CONFIG.preferTthFor3UnitLecture,
      preferRandom3DayFor3UnitLecture:
        typeof o.preferRandom3DayFor3UnitLecture === "boolean"
          ? (o.preferRandom3DayFor3UnitLecture as boolean)
          : DEFAULT_SCHEDULING_CONFIG.preferRandom3DayFor3UnitLecture,
      requireLabBreakAfterLongLab:
        typeof o.requireLabBreakAfterLongLab === "boolean"
          ? (o.requireLabBreakAfterLongLab as boolean)
          : DEFAULT_SCHEDULING_CONFIG.requireLabBreakAfterLongLab,
      maxBlockMinutes: typeof o.maxBlockMinutes === "number" ? o.maxBlockMinutes : DEFAULT_SCHEDULING_CONFIG.maxBlockMinutes,
      excludedDays: Array.isArray(o.excludedDays) && o.excludedDays.every((d: unknown) => typeof d === "number" && d >= 1 && d <= 6)
        ? o.excludedDays
        : DEFAULT_SCHEDULING_CONFIG.excludedDays,
    };
  }
  return { ...DEFAULT_SCHEDULING_CONFIG };
}
