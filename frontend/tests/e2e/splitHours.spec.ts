import { test, expect } from "@playwright/test";
import { scheduledMinutes } from "../../src/utils/scheduledMinutes";

const slot = (over: Record<string, unknown>) => ({ subjectId: "s", dayOfWeek: 1, startTime: "08:00", endTime: "09:00", isSplit: false, facultyId: "a", ...over });
const total = (loads: ReturnType<typeof slot>[]) => scheduledMinutes(loads, (l) => l.subjectId).get("s");

test.describe("scheduled hours of a class", () => {
  test("a split block moved to another time is not counted as extra hours", () => {
    // split in the same slot: one hour
    expect(total([slot({ isSplit: true, facultyId: "a" }), slot({ isSplit: true, facultyId: "b" })])).toBe(60);
    // the second group moved to another day and time: still one hour (each group takes the full hours)
    expect(total([slot({ isSplit: true, facultyId: "a" }), slot({ isSplit: true, facultyId: "b", dayOfWeek: 3, startTime: "13:00", endTime: "14:00" })])).toBe(60);
    // a group with two meetings a week: its two meetings count, the other group does not add
    expect(total([
      slot({ isSplit: true, facultyId: "a" }),
      slot({ isSplit: true, facultyId: "a", dayOfWeek: 3 }),
      slot({ isSplit: true, facultyId: "b", dayOfWeek: 2, startTime: "10:00", endTime: "11:00" }),
      slot({ isSplit: true, facultyId: "b", dayOfWeek: 4, startTime: "10:00", endTime: "11:00" }),
    ])).toBe(120);
  });

  test("ordinary blocks still count once per slot, co-instructors included", () => {
    expect(total([slot({}), slot({ facultyId: "b" })])).toBe(60);
    expect(total([slot({}), slot({ dayOfWeek: 3, startTime: "09:00", endTime: "10:30" })])).toBe(150);
  });
});
