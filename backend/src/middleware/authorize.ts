/// <reference path="../types/express.d.ts" />
import type { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";
import { forbidden } from "../utils/errors.js";

/** Roles that may read but never change data. Use after authorize() on routers that also expose writes. */
export function readOnly(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user && roles.includes(req.user.role) && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next(forbidden("This role has read-only access"));
      return;
    }
    next();
  };
}

/**
 * Restrict a route to exactly these roles: no read-only viewer gets in through a dean's access. Use it for what only
 * these roles may even read (the audit log).
 */
export function authorizeExact(...allowedRoles: Role[]) {
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

/** Restrict route to given roles. Must be used after authenticate. */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(forbidden("Authentication required"));
      return;
    }
    // The president and the unit viewers see what a dean sees across colleges, and can change nothing.
    const presidentViewing = (req.user.role === "PRESIDENT" || req.user.role === "UNIT") && allowedRoles.includes("DEAN") && ["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (!allowedRoles.includes(req.user.role) && !presidentViewing) {
      next(forbidden("Insufficient permissions"));
      return;
    }
    next();
  };
}
