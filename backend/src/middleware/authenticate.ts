/// <reference path="../types/express.d.ts" />
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { unauthorized } from "../utils/errors.js";
import { runWithActor } from "../utils/auditContext.js";

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    next(unauthorized("Access token required"));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, departmentId: true, collegeId: true, name: true, isDeleted: true },
    });
    if (!user || user.isDeleted) {
      next(unauthorized("User not found"));
      return;
    }
    const { isDeleted: _d, ...userWithoutDeleted } = user;
    req.user = userWithoutDeleted;
    // the rest of the request runs with this person as the actor of any audit entry
    runWithActor(
      { id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.departmentId, collegeId: user.collegeId },
      () => next()
    );
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
}
