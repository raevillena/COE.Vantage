import type { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: Role;
      departmentId: string | null;
      /** null for the admin, the president and unit viewers, who span colleges */
      collegeId: string | null;
      name: string;
      unitColleges?: string[];
      unitAreas?: string[];
    }
    interface Request {
      user?: User;
    }
  }
}

export {};
