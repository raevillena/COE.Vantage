import { prisma } from "../../prisma/client.js";
import { badRequest, forbidden, notFound } from "../../utils/errors.js";
import { loadDeloadings, round2 } from "../../utils/deloading.js";
import { TEACHING_ROLES } from "../../utils/teachingRoles.js";
import { notifyUsers } from "../notifications/notificationService.js";
import { assertTermUnlocked } from "../../utils/termLock.js";
import type { CopyDeloadingsBody, PutDeloadingsBody } from "./deloadingSchemas.js";

export interface DeloadingCaller {
  id: string;
  role: string;
  departmentId: string | null;
}

/** Users the caller may see: the college for admin / dean / college secretary, a department for a chairman, only themselves otherwise. */
function userScope(caller: DeloadingCaller) {
  if (caller.role === "ADMIN" || caller.role === "DEAN" || caller.role === "COLLEGE_SECRETARY") return {};
  if (caller.role === "CHAIRMAN") return caller.departmentId ? { departmentId: caller.departmentId } : { id: caller.id };
  return { id: caller.id };
}

export async function listDeloadings(academicYearId: string, semester: number, caller: DeloadingCaller) {
  const users = await prisma.user.findMany({
    where: { isDeleted: false, role: { in: TEACHING_ROLES }, ...userScope(caller) },
    select: { id: true },
  });
  const map = await loadDeloadings(academicYearId, semester, users.map((u) => u.id));
  return [...map.entries()].map(([userId, d]) => ({ userId, total: d.total, items: d.items }));
}

/** Only an admin, or the chairman of the person's own department, may change deloading. */
async function assertCanEdit(userId: string, caller: DeloadingCaller) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, departmentId: true, isDeleted: true } });
  if (!user || user.isDeleted) throw notFound("User not found");
  if (!(TEACHING_ROLES as string[]).includes(user.role)) {
    throw badRequest("Deloading applies to faculty, chairmen, deans and the college secretary.");
  }
  if (caller.role === "ADMIN") return user;
  if (caller.role === "CHAIRMAN" && caller.departmentId && user.departmentId === caller.departmentId) return user;
  throw forbidden("You can only change deloading for faculty in your own department.");
}

/** Replaces one person's deloading for one term. */
export async function replaceDeloadings(userId: string, body: PutDeloadingsBody, caller: DeloadingCaller) {
  await assertCanEdit(userId, caller);
  const person = await prisma.user.findUnique({ where: { id: userId }, select: { collegeId: true } });
  await assertTermUnlocked(body.academicYearId, body.semester, person?.collegeId);
  const ay = await prisma.academicYear.findFirst({ where: { id: body.academicYearId, isDeleted: false } });
  if (!ay) throw badRequest("Academic year not found");
  await prisma.$transaction(async (tx) => {
    await tx.facultyDeloading.deleteMany({ where: { userId, academicYearId: body.academicYearId, semester: body.semester } });
    if (body.items.length > 0) {
      await tx.facultyDeloading.createMany({
        data: body.items.map((i) => ({
          userId,
          academicYearId: body.academicYearId,
          semester: body.semester,
          description: i.description,
          units: round2(i.units),
        })),
      });
    }
  });
  const map = await loadDeloadings(body.academicYearId, body.semester, [userId]);
  const d = map.get(userId) ?? { total: 0, items: [] };
  void notifyUsers([userId], {
    type: "DELOADING",
    title: "Your deloading was updated",
    body: d.items.length === 0 ? "No deloading for this term" : `${d.total} ${d.total === 1 ? "unit" : "units"} of deloading this term`,
    link: "/dashboard",
    groupKey: "deloading",
  }, { exceptUserId: caller.id });
  return { userId, total: d.total, items: d.items };
}

/** Copies deloading from one term to another, for people who have none in the target term yet. */
export async function copyDeloadings(body: CopyDeloadingsBody, caller: DeloadingCaller) {
  if (caller.role !== "ADMIN" && caller.role !== "CHAIRMAN") throw forbidden("Not allowed to change deloading.");
  if (caller.role === "CHAIRMAN" && !caller.departmentId) throw forbidden("Chairman must belong to a department.");
  if (body.fromAcademicYearId === body.toAcademicYearId && body.fromSemester === body.toSemester) {
    throw badRequest("Pick a different term to copy from.");
  }
  await assertTermUnlocked(body.toAcademicYearId, body.toSemester);
  const ay = await prisma.academicYear.findFirst({ where: { id: body.toAcademicYearId, isDeleted: false } });
  if (!ay) throw badRequest("Target academic year not found");

  const users = await prisma.user.findMany({
    where: {
      isDeleted: false,
      role: { in: TEACHING_ROLES },
      ...(caller.role === "CHAIRMAN" ? { departmentId: caller.departmentId! } : {}),
      ...(body.userIds && body.userIds.length > 0 ? { id: { in: body.userIds } } : {}),
    },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const [source, existing] = await Promise.all([
    loadDeloadings(body.fromAcademicYearId, body.fromSemester, userIds),
    loadDeloadings(body.toAcademicYearId, body.toSemester, userIds),
  ]);
  const data: { userId: string; academicYearId: string; semester: number; description: string; units: number }[] = [];
  let people = 0;
  let skipped = 0;
  for (const [userId, d] of source) {
    if (existing.has(userId)) {
      skipped++;
      continue;
    }
    people++;
    for (const i of d.items) {
      data.push({ userId, academicYearId: body.toAcademicYearId, semester: body.toSemester, description: i.description, units: i.units });
    }
  }
  if (data.length > 0) await prisma.facultyDeloading.createMany({ data });
  return { found: source.size, copiedPeople: people, copiedItems: data.length, skippedPeople: skipped };
}
