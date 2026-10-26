import type { Role } from "../types/auth";

/** over: above the maximum less deloading; under: below it; full: exactly at it; unset: no maximum to compare to. */
export type LoadState = "over" | "under" | "full" | "unset";

export const LOAD_STATE_LABEL: Record<LoadState, string> = {
  over: "Overload",
  under: "Underload",
  full: "Fully loaded",
  unset: "No maximum set",
};

/** Colours used everywhere a load state is shown: red = overload, amber = underload, green = fully loaded. */
export const LOAD_STATE_BADGE: Record<LoadState, string> = {
  over: "bg-danger-muted text-danger",
  under: "bg-warning-muted text-warning",
  full: "bg-success-muted text-success",
  unset: "bg-surface-muted text-foreground-muted",
};

export const LOAD_STATE_TEXT: Record<LoadState, string> = {
  over: "font-medium text-danger",
  under: "font-medium text-warning",
  full: "font-medium text-success",
  unset: "text-foreground-muted",
};

/** Same rule as the server: maximum less deloading, never below zero; null when no maximum is set. */
export function effectiveMax(maxUnits: number | null | undefined, deloadTotal: number): number | null {
  if (maxUnits == null || maxUnits < 0) return null;
  return Math.max(0, Math.round((maxUnits - deloadTotal) * 100) / 100);
}

export function loadStateOf(assigned: number, effMax: number | null): LoadState {
  if (effMax == null) return "unset";
  if (assigned > effMax + 0.05) return "over";
  if (assigned < effMax - 0.05) return "under";
  return "full";
}

/** Roles that can carry a teaching load (and so have a maximum, deloading and a workload). */
const TEACHING: Role[] = ["FACULTY", "CHAIRMAN", "DEAN", "COLLEGE_SECRETARY"];
export const isTeachingRole = (role: string | undefined | null): boolean => TEACHING.includes(role as Role);

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  DEAN: "Dean",
  CHAIRMAN: "Chairman",
  FACULTY: "Faculty",
  OFFICER: "Officer",
  COLLEGE_SECRETARY: "College Secretary",
};
