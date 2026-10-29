import type { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: Role;
      departmentId: string | null;
      /** null for the admin and the president, who span colleges */
      collegeId: string | null;
      name: string;
    }
    interface Request {
      user?: User;
    }
  }
}

export {};
