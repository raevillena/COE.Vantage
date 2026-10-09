export type Role = "ADMIN" | "DEAN" | "CHAIRMAN" | "FACULTY" | "OFFICER";
export type ExperimentalFeatureKey = "gradeModule";

export interface ExperimentalFeaturesPreference {
  enabled: boolean;
  features: ExperimentalFeatureKey[];
}

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  departmentId: string | null;
  experimentalFeatures?: ExperimentalFeaturesPreference;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}
