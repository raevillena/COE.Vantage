/// <reference path="../types/express.d.ts" />
import type { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";
import { forbidden } from "../utils/errors.js";

/** Restrict route to given roles. Must be used after authenticate. */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(forbidden("Authentication required"));
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(forbidden("Insufficient permissions"));
      return;
    }
    next();
  };
}
