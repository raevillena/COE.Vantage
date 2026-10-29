import { prisma } from "../../prisma/client.js";
import { badRequest, conflict, forbidden, notFound } from "../../utils/errors.js";
import { currentActor, runUnscoped } from "../../utils/auditContext.js";
import { resolveCollegeId } from "../../utils/collegeScope.js";
import { notifyUsers, userIdsWithRole } from "../notifications/notificationService.js";
import { audit } from "../audit/auditService.js";
import type { CreateAcademicYearBody, SetCurrentTermBody, SetTermLockBody, UpdateAcademicYearBody } from "./academicYearSchemas.js";

const SEM_NAME = ["", "1st Sem", "2nd Sem", "Mid Year"];

type YearRow = { id: string; isActive: boolean; currentSemester: number };

/**
 * Academic years are shared by every college, but each college picks its own current term. This sets `isActive` and
 * `currentSemester` as the signed-in person's college sees them. The admin and president, who belong to no college,
 * see a year as current when any college is on it.
 */
async function withCurrent<T extends YearRow>(years: T[]): Promise<T[]> {
  const mine = currentActor()?.collegeId;
  if (mine) {
    const c = await prisma.college.findUnique({ where: { id: mine }, select: { currentAcademicYearId: true, currentSemester: true } });
    return years.map((y) => {
      const on = c?.currentAcademicYearId === y.id;
      return { ...y, isActive: on, currentSemester: on ? c?.currentSemester ?? 1 : y.currentSemester };
    });
  }
  const colleges = await prisma.college.findMany({ where: { isDeleted: false, currentAcademicYearId: { not: null } }, orderBy: { name: "asc" }, select: { currentAcademicYearId: true, currentSemester: true } });
  return years.map((y) => {
    const c = colleges.find((x) => x.currentAcademicYearId === y.id);
    return { ...y, isActive: Boolean(c), currentSemester: c?.currentSemester ?? y.currentSemester };
  });
}

export async function listAcademicYears() {
  const years = await prisma.academicYear.findMany({
    where: { isDeleted: false },
    orderBy: { name: "desc" },
    include: {
      termLocks: {
        // a dean or secretary sees their own college's locks; the admin and president see every college's
        ...(currentActor()?.collegeId ? { where: { collegeId: currentActor()!.collegeId! } } : {}),
        select: { semester: true, collegeId: true, lockedByName: true, lockedAt: true },
        orderBy: { semester: "asc" },
      },
    },
  });
  return withCurrent(years);
}

/** Only the academic years the signed-in person's college is on (for schedules/reports). */
export async function listActiveAcademicYears() {
  const years = await prisma.academicYear.findMany({ where: { isDeleted: false }, orderBy: { name: "desc" } });
  return (await withCurrent(years)).filter((y) => y.isActive);
}

export async function getAcademicYearById(id: string) {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y || y.isDeleted) throw notFound("Academic year not found");
  return y;
}

/** The academic year the signed-in person's college is on, or null when it has not started. */
export async function getActiveAcademicYear() {
  const years = await prisma.academicYear.findMany({ where: { isDeleted: false }, orderBy: { name: "desc" } });
  return (await withCurrent(years)).find((y) => y.isActive) ?? null;
}

/** Academic years are shared by all colleges, so one name exists once. */
async function assertNameFree(name: string, exceptId?: string) {
  const same = await prisma.academicYear.findFirst({
    where: { name: { equals: name.trim(), mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (!same) return;
  throw conflict(
    same.isDeleted
      ? `An academic year named "${same.name}" is in the Trash. Restore it instead of adding it again.`
      : `The academic year "${same.name}" already exists. Academic years are shared by every college, so use that one.`
  );
}

export async function createAcademicYear(body: CreateAcademicYearBody) {
  await assertNameFree(body.name);
  return prisma.academicYear.create({ data: { name: body.name.trim() } });
}

export async function updateAcademicYear(id: string, body: UpdateAcademicYearBody) {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y) throw notFound("Academic year not found");
  if (y.isDeleted) throw badRequest("Cannot update a deleted academic year. Restore it from Trash first.");
  if (body.name !== undefined && body.name.trim().toLowerCase() !== y.name.toLowerCase()) {
    await assertNameFree(body.name, id);
    await prisma.academicYear.update({ where: { id }, data: { name: body.name.trim() } });
  }
  return prisma.academicYear.findUniqueOrThrow({ where: { id } });
}

/** Locks or unlocks one semester of an academic year. A locked semester takes no scheduling changes from anyone. */
export async function setTermLock(academicYearId: string, body: SetTermLockBody, actor: { id: string; name: string }) {
  const y = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!y || y.isDeleted) throw notFound("Academic year not found");
  // a dean or college secretary can only lock their own college; the admin names the college
  const mine = currentActor()?.collegeId;
  if (mine && body.collegeId && body.collegeId !== mine) throw forbidden("You can only lock your own college.");
  const collegeId = await resolveCollegeId(prisma, mine ?? body.collegeId);
  const college = await runUnscoped(() => prisma.college.findUnique({ where: { id: collegeId }, select: { name: true } }));
  if (!college) throw notFound("College not found");
  const existing = await prisma.termLock.findFirst({ where: { collegeId, academicYearId, semester: body.semester } });
  if (body.locked && !existing) {
    await prisma.termLock.create({ data: { collegeId, academicYearId, semester: body.semester, lockedByName: actor.name } });
  } else if (!body.locked && existing) {
    await prisma.termLock.delete({ where: { id: existing.id } });
  } else {
    return { locked: body.locked, changed: false };
  }
  await audit({
    entityType: "ACADEMIC_YEAR",
    entityId: y.id,
    entityLabel: y.name,
    action: body.locked ? "LOCK" : "UNLOCK",
    summary: `${body.locked ? "Locked" : "Unlocked"} ${["", "1st Sem", "2nd Sem", "Mid Year"][body.semester]} of ${y.name} for ${college.name}`,
    academicYearId: y.id,
    semester: body.semester,
    collegeId,
  });
  const term = `${y.name}, ${["", "1st semester", "2nd semester", "Mid year"][body.semester] ?? "semester " + body.semester}`;
  void userIdsWithRole("CHAIRMAN", "FACULTY").then((ids) =>
    notifyUsers(ids, {
      type: "TERM_LOCK",
      title: body.locked ? "A semester was locked" : "A semester was unlocked",
      body: body.locked ? `${term} takes no schedule changes until it is unlocked.` : `${term} can be changed again.`,
      link: "/dashboard",
    }, { exceptUserId: actor.id })
  );
  return { locked: body.locked, changed: true };
}

/**
 * Sets the term a college is scheduling now, or marks it as not started (academicYearId null). A college secretary
 * sets their own college; the admin names the college. Other colleges are not affected.
 */
export async function setCurrentTerm(body: SetCurrentTermBody) {
  const mine = currentActor()?.collegeId;
  if (mine && body.collegeId && body.collegeId !== mine) throw forbidden("You can only set your own college's term.");
  const collegeId = await resolveCollegeId(prisma, mine ?? body.collegeId);
  const college = await prisma.college.findUnique({ where: { id: collegeId } });
  if (!college || college.isDeleted) throw notFound("College not found");
  const before = college.currentAcademicYearId
    ? await prisma.academicYear.findUnique({ where: { id: college.currentAcademicYearId }, select: { name: true } })
    : null;
  const from = before ? `${before.name}, ${SEM_NAME[college.currentSemester ?? 1]}` : null;

  if (body.academicYearId === null) {
    await prisma.college.update({ where: { id: collegeId }, data: { currentAcademicYearId: null, currentSemester: null } });
    await audit({
      entityType: "ACADEMIC_YEAR",
      entityLabel: college.name,
      action: "SET_CURRENT_TERM",
      summary: `Marked ${college.name} as not started: no current term`,
      changes: { currentTerm: { from, to: null } },
      collegeId,
    });
    return { collegeId, academicYearId: null, semester: null };
  }
  if (!body.semester) throw badRequest("Choose the semester");
  const y = await prisma.academicYear.findUnique({ where: { id: body.academicYearId } });
  if (!y || y.isDeleted) throw notFound("Academic year not found");
  await prisma.college.update({ where: { id: collegeId }, data: { currentAcademicYearId: y.id, currentSemester: body.semester } });
  const to = `${y.name}, ${SEM_NAME[body.semester]}`;
  await audit({
    entityType: "ACADEMIC_YEAR",
    entityId: y.id,
    entityLabel: y.name,
    action: "SET_CURRENT_TERM",
    summary: `Set the current term to ${to} for ${college.name}`,
    changes: { currentTerm: { from, to } },
    collegeId,
  });
  void (async () => {
    // the people of that college, not the whole university
    const people = await runUnscoped(() => prisma.user.findMany({ where: { collegeId, isDeleted: false }, select: { id: true } }));
    await notifyUsers(
      people.map((u) => u.id),
      { type: "TERM", title: "The current term changed", body: to, link: "/dashboard", groupKey: "term" },
      { exceptUserId: currentActor()?.id }
    );
  })();
  return { collegeId, academicYearId: y.id, semester: body.semester };
}

export async function softDeleteAcademicYear(id: string) {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y) throw notFound("Academic year not found");
  if (y.isDeleted) throw badRequest("Academic year is already deleted");
  await prisma.academicYear.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  // colleges that were on this year are no longer on any
  await prisma.college.updateMany({ where: { currentAcademicYearId: id }, data: { currentAcademicYearId: null, currentSemester: null } });
}

export async function listTrashAcademicYears() {
  return prisma.academicYear.findMany({
    where: { isDeleted: true },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreAcademicYear(id: string) {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y) throw notFound("Academic year not found");
  if (!y.isDeleted) throw badRequest("Academic year is not in trash");
  await prisma.academicYear.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });
}

export async function permanentDeleteAcademicYear(id: string) {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y) throw notFound("Academic year not found");
  if (!y.isDeleted) throw badRequest("Only academic years in Trash can be permanently deleted");
  await prisma.academicYear.delete({ where: { id } });
  // colleges that were on this year are no longer on any
  await prisma.college.updateMany({ where: { currentAcademicYearId: id }, data: { currentAcademicYearId: null, currentSemester: null } });
}