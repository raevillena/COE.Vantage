import type { Prisma } from "@prisma/client";

export const EXPERIMENTAL_FEATURE_KEYS = ["gradeModule"] as const;

export type ExperimentalFeatureKey = (typeof EXPERIMENTAL_FEATURE_KEYS)[number];

export interface ExperimentalFeaturesPreference {
  enabled: boolean;
  features: ExperimentalFeatureKey[];
}

const featureKeySet = new Set<string>(EXPERIMENTAL_FEATURE_KEYS);

function toObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function normalizeExperimentalFeatures(
  value: Prisma.JsonValue | null | undefined
): ExperimentalFeaturesPreference {
  const raw = toObject(value);
  if (!raw) return { enabled: false, features: [] };

  const enabled = raw.enabled === true;
  const rawFeatures = Array.isArray(raw.features) ? raw.features : [];
  const features = rawFeatures
    .filter((feature): feature is string => typeof feature === "string")
    .filter((feature): feature is ExperimentalFeatureKey => featureKeySet.has(feature));

  return { enabled, features };
}

