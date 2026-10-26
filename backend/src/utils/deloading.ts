import { prisma } from "../prisma/client.js";

/** Units are credited in tenths at most (e.g. 0.6, 1.2), so comparisons use a small tolerance. */
const EPSILON = 0.05;

export type LoadState = "over" | "under" | "full" | "unset";

export interface DeloadSummary {
  total: number;
  items: { id: string; description: string; units: number }[];
}

/** Deloading per user for one term (user id -> items and total). Only users with items appear. */
export async function loadDeloadings(
  academicYearId: string,
  semester: number,
  userIds?: string[]
): Promise<Map<string, DeloadSummary>> {
  const rows = await prisma.facultyDeloading.findMany({
    where: { academicYearId, semester, ...(userIds ? { userId: { in: userIds } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, description: true, units: true },
  });
  const map = new Map<string, DeloadSummary>();
  for (const r of rows) {
    const entry = map.get(r.userId) ?? { total: 0, items: [] };
    entry.total = round2(entry.total + r.units);
    entry.items.push({ id: r.id, description: r.description, units: r.units });
    map.set(r.userId, entry);
  }
  return map;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The maximum units a person can carry in a term: their maximum minus deloading, never below zero.
 * Null means no cap is set, so no overload or underload can be judged.
 */
export function effectiveMaxUnits(maxUnits: number | null | undefined, deloadTotal: number): number | null {
  if (maxUnits == null || maxUnits < 0) return null;
  return Math.max(0, round2(maxUnits - deloadTotal));
}

/** over: above the effective maximum; under: below it; full: exactly at it; unset: no cap to compare to. */
export function loadState(assignedUnits: number, effectiveMax: number | null): LoadState {
  if (effectiveMax == null) return "unset";
  if (assignedUnits > effectiveMax + EPSILON) return "over";
  if (assignedUnits < effectiveMax - EPSILON) return "under";
  return "full";
}
