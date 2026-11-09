import type { Job } from "./job";
import type { PlanItem } from "./plan";
import type { PortalSheet } from "./portal";

/** Sets the dropdowns of the approved rows and fires the events the portal listens to (it recomputes Remarks on "change"). */
export function applyChanges(items: PlanItem[]): { applied: number; failed: PlanItem[] } {
  let applied = 0;
  const failed: PlanItem[] = [];
  for (const item of items) {
    const select = item.portal?.select;
    if (!select || item.value === undefined) continue;
    select.value = item.value;
    if (select.value !== item.value) {
      failed.push(item);
      continue;
    }
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    applied++;
  }
  return { applied, failed };
}

export type VerifyStatus = "match" | "differs" | "missing";

export interface VerifyItem {
  studentNumber: string;
  name: string;
  expected: string;
  actual: string;
  status: VerifyStatus;
}

export interface Verification {
  items: VerifyItem[];
  /** Portal rows that were not part of the fill but have a different grade than before it. */
  unexpected: { studentNumber: string; name: string; before: string; after: string }[];
  matched: number;
}

/** Compares what the fill promised with what the portal shows now. */
export function verifyJob(job: Job, sheet: PortalSheet): Verification {
  const byKey = new Map(sheet.rows.map((row) => [row.key, row]));
  const items: VerifyItem[] = job.expected.map((exp) => {
    const row = byKey.get(exp.key);
    if (!row) return { studentNumber: exp.studentNumber, name: exp.name, expected: exp.value, actual: "", status: "missing" };
    return {
      studentNumber: exp.studentNumber,
      name: exp.name,
      expected: exp.value,
      actual: row.current,
      status: row.current === exp.value ? "match" : "differs",
    };
  });

  const promised = new Set(job.expected.map((exp) => exp.key));
  const unexpected = sheet.rows
    .filter((row) => !promised.has(row.key) && (job.before[row.key] ?? "") !== row.current)
    .map((row) => ({ studentNumber: row.studentNumber, name: row.name, before: job.before[row.key] ?? "", after: row.current }));

  return { items, unexpected, matched: items.filter((item) => item.status === "match").length };
}
