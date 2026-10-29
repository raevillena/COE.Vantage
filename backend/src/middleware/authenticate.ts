/// <reference path="../types/express.d.ts" />
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { forbidden, unauthorized } from "../utils/errors.js";
import { runWithActor } from "../utils/auditContext.js";

/** What a unit viewer's areas open: the first path segment of an API route -> the areas that grant it (any one is enough). */
const UNIT_AREA_OF_ROUTE: Record<string, string[]> = {
  "/rooms": ["ROOMS"],
  "/room-share": ["ROOMS"],
  "/faculty-loads": ["SCHEDULES"],
  "/assignment-requests": ["SCHEDULES"],
  "/dashboard": ["SCHEDULES"],
  "/student-classes": ["CURRICULUM"],
  "/subjects": ["CURRICULUM"],
  "/curriculum": ["CURRICULUM"],
  "/departments": ["CURRICULUM"],
  "/ge-import": ["CURRICULUM"],
  "/users": ["FACULTY", "SCHEDULES"],
  "/deloadings": ["FACULTY"],
  "/reports": ["REPORTS"],
};

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
      select: { id: true, email: true, role: true, departmentId: true, collegeId: true, name: true, isDeleted: true, unitColleges: true, unitAreas: true },
    });
    if (!user || user.isDeleted) {
      next(unauthorized("User not found"));
      return;
    }
    const { isDeleted: _d, ...userWithoutDeleted } = user;
    req.user = userWithoutDeleted;

    // A unit viewer opens only the areas the admin granted.
    if (user.role === "UNIT") {
      const need = UNIT_AREA_OF_ROUTE[req.baseUrl];
      if (need && !need.some((a) => user.unitAreas.includes(a))) {
        next(forbidden("This part of the system is not open to your account."));
        return;
      }
    }

    // The admin and the president can look at one college at a time (the college switcher sends X-College-Id); a unit
    // viewer only at the colleges the admin granted. Everyone else belongs to one college and sees only that.
    const asked = typeof req.headers["x-college-id"] === "string" ? (req.headers["x-college-id"] as string) : "";
    let viewCollegeId: string | null = null;
    let allowedCollegeIds: string[] | null = null;
    if (user.role === "UNIT") {
      allowedCollegeIds = user.unitColleges;
      if (asked && allowedCollegeIds.includes(asked)) viewCollegeId = asked;
    } else if ((user.role === "ADMIN" || user.role === "PRESIDENT") && /^[0-9a-f-]{36}$/i.test(asked)) {
      const exists = await prisma.college.findFirst({ where: { id: asked, isDeleted: false }, select: { id: true } });
      if (exists) viewCollegeId = asked;
    }

    // the rest of the request runs with this person as the actor of any audit entry
    runWithActor(
      { id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.departmentId, collegeId: user.collegeId, viewCollegeId, allowedCollegeIds },
      () => next()
    );
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
}
