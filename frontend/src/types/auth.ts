export type Role = "ADMIN" | "DEAN" | "CHAIRMAN" | "FACULTY" | "OFFICER" | "COLLEGE_SECRETARY" | "PRESIDENT" | "UNIT";
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
  /** Changes when the person's picture does; null when they have none. */
  avatarVersion?: number | null;
  /** UNIT role: the colleges and areas the admin granted. */
  unitColleges?: string[];
  unitAreas?: string[];
  experimentalFeatures?: ExperimentalFeaturesPreference;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}
