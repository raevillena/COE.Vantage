export type Role = "ADMIN" | "DEAN" | "CHAIRMAN" | "FACULTY" | "OFFICER";

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  departmentId: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}
