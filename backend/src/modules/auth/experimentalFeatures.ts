import type { Prisma } from "@prisma/client";

export const EXPERIMENTAL_FEATURE_KEYS = ["gradeModule", "mmsuGradePush"] as const;

/** Roles each feature is meant for. Mirrors `allowedRoles` in the frontend feature catalog. */
export const EXPERIMENTAL_FEATURE_ROLES: Record<(typeof EXPERIMENTAL_FEATURE_KEYS)[number], readonly string[]> = {
  gradeModule: ["ADMIN", "FACULTY", "CHAIRMAN", "DEAN"],
  mmsuGradePush: ["ADMIN", "FACULTY", "CHAIRMAN", "DEAN", "COLLEGE_SECRETARY"],
};

export type ExperimentalFeatureKey = (typeof EXPERIMENTAL_FEATURE_KEYS)[number];

export interface ExperimentalFeaturesPreference {
  enabled: boolean;
  /** What the user has switched on. Always a subset of `granted`. */
  features: ExperimentalFeatureKey[];
  /** What an administrator allows this user to switch on. Administrators are always granted everything. */
  granted: ExperimentalFeatureKey[];
}

const featureKeySet = new Set<string>(EXPERIMENTAL_FEATURE_KEYS);

function toObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toKeys(value: unknown): ExperimentalFeatureKey[] {
  const list = Array.isArray(value) ? value : [];
  return list.filter((feature): feature is ExperimentalFeatureKey => typeof feature === "string" && featureKeySet.has(feature));
}

/**
 * Stored shape: { enabled, features, granted? }. Records saved before grants existed have no `granted`: whatever the
 * user had switched on stays allowed, so nobody loses access when this ships.
 */
export function normalizeExperimentalFeatures(
  value: Prisma.JsonValue | null | undefined,
  role?: string
): ExperimentalFeaturesPreference {
  const raw = toObject(value);
  const enabled = raw?.enabled === true;
  const picked = toKeys(raw?.features);
  const granted = role === "ADMIN" ? [...EXPERIMENTAL_FEATURE_KEYS] : raw && "granted" in raw ? toKeys(raw.granted) : picked;
  return { enabled, features: picked.filter((feature) => granted.includes(feature)), granted };
}
