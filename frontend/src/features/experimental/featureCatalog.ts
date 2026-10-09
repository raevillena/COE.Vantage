import type { ExperimentalFeatureKey, Role, User } from "../../types/auth";

export interface ExperimentalFeatureDefinition {
  key: ExperimentalFeatureKey;
  label: string;
  description: string;
  routePath: string;
  sidebarLabel: string;
  allowedRoles: Role[];
}

export const experimentalFeatureCatalog: Record<ExperimentalFeatureKey, ExperimentalFeatureDefinition> = {
  gradeModule: {
    key: "gradeModule",
    label: "Grade Module",
    description: "Early access to grade subjects, records, and grade-sharing tools.",
    routePath: "/experimental/grades",
    sidebarLabel: "Grades",
    allowedRoles: ["ADMIN", "FACULTY", "CHAIRMAN", "DEAN"],
  },
};

export function getExperimentalFeaturesForUser(user: User | null): ExperimentalFeatureDefinition[] {
  if (!user?.experimentalFeatures?.enabled) return [];
  const enabled = new Set(user.experimentalFeatures.features);
  return (Object.values(experimentalFeatureCatalog) as ExperimentalFeatureDefinition[]).filter(
    (feature) => enabled.has(feature.key) && feature.allowedRoles.includes(user.role)
  );
}

export function hasExperimentalFeatureEnabled(
  user: User | null,
  featureKey: ExperimentalFeatureKey
): boolean {
  if (!user?.experimentalFeatures?.enabled) return false;
  const feature = experimentalFeatureCatalog[featureKey];
  if (!feature) return false;
  return (
    user.experimentalFeatures.features.includes(featureKey) &&
    feature.allowedRoles.includes(user.role)
  );
}

