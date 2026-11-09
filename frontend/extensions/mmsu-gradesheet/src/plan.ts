import type { SourceRow } from "./paste";
import { resolveGrade } from "./grade";
import type { PortalRow } from "./portal";
import { namesDisagree } from "./studentNumber";

export type PlanStatus =
  /** The portal will change from `current` to `value`. */
  | "change"
  /** The portal already has this grade. */
  | "same"
  /** The pasted grade cell is empty; the portal row is left alone. */
  | "blank"
  /** The pasted grade is not one the portal offers. */
  | "invalid"
  /** The same student number is pasted twice with different grades. */
  | "duplicate"
  /** No student with this number on the portal gradesheet. */
  | "not-on-portal"
  /** The portal row cannot be edited. */
  | "locked";

export interface PlanItem {
  source: SourceRow;
  portal?: PortalRow;
  status: PlanStatus;
  /** The portal grade to set (status "change") or already present ("same"). */
  value?: string;
  current?: string;
  reason?: string;
  /** Same student number, but the pasted name shares no word with the portal name. */
  nameWarning: boolean;
}

export interface Plan {
  items: PlanItem[];
  /** Students on the portal gradesheet that the paste does not mention (left untouched). */
  portalOnly: PortalRow[];
}

/**
 * Compares the pasted rows with the portal gradesheet. Students are matched by student number only;
 * a name is never used to find a row, only to warn when it disagrees with a number that matched.
 */
export function buildPlan(source: SourceRow[], portal: PortalRow[]): Plan {
  const byKey = new Map(portal.map((row) => [row.key, row]));

  // Resolve every pasted grade first so duplicates can be judged on the grade they would set.
  const resolved = source.map((row) => {
    const target = byKey.get(row.key);
    return { row, target, grade: resolveGrade(row.rawGrade, target?.options ?? [...ALL_OPTIONS_FALLBACK]) };
  });

  const seen = new Map<string, string>();
  const conflicting = new Set<string>();
  for (const { row, grade } of resolved) {
    const value = grade.kind === "grade" ? grade.value : "";
    if (!seen.has(row.key)) seen.set(row.key, value);
    else if (seen.get(row.key) !== value) conflicting.add(row.key);
  }

  const handled = new Set<string>();
  const items: PlanItem[] = [];
  for (const { row, target, grade } of resolved) {
    const base = { source: row, portal: target, nameWarning: !!target && namesDisagree(row.name, target.name) };
    if (conflicting.has(row.key)) {
      items.push({ ...base, status: "duplicate", reason: "listed more than once with different grades" });
      continue;
    }
    // An identical repeat is the same instruction; keep the first.
    if (handled.has(row.key)) continue;
    handled.add(row.key);

    if (!target) items.push({ ...base, status: "not-on-portal", reason: "no student with this number on the portal gradesheet" });
    else if (grade.kind === "blank") items.push({ ...base, status: "blank", current: target.current, reason: "empty grade cell" });
    else if (grade.kind === "invalid") items.push({ ...base, status: "invalid", current: target.current, reason: grade.reason });
    else if (target.locked) items.push({ ...base, status: "locked", current: target.current, reason: "the portal does not let this grade be edited" });
    else if (target.current === grade.value) items.push({ ...base, status: "same", value: grade.value, current: target.current });
    else items.push({ ...base, status: "change", value: grade.value, current: target.current });
  }

  const pasted = new Set(source.map((row) => row.key));
  return { items, portalOnly: portal.filter((row) => !pasted.has(row.key)) };
}

/** Used only to word an error for a pasted number that is not on the portal; no row is ever written for it. */
const ALL_OPTIONS_FALLBACK = ["1.00", "1.25", "1.50", "1.75", "2.00", "2.25", "2.50", "2.75", "3.00", "4.00", "5.00", "INC", "DRP", "IP"];
