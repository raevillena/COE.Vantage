import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import { currentActor, runUnscoped } from "../../utils/auditContext.js";

/** Colleges the signed-in person may see: all of them for the admin and president, their own for everyone else. */
export async function listColleges() {
  const mine = currentActor()?.collegeId;
  return prisma.college.findMany({
    where: { isDeleted: false, ...(mine ? { id: mine } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, universityId: true, name: true, code: true, currentAcademicYearId: true, currentSemester: true },
  });
}

export async function createCollege(body: { name: string; code?: string | null }) {
  const university = await prisma.university.findFirst({ orderBy: { createdAt: "asc" } });
  if (!university) throw badRequest("There is no university yet");
  const name = body.name.trim();
  const dup = await prisma.college.findFirst({ where: { universityId: university.id, isDeleted: false, name: { equals: name, mode: "insensitive" } } });
  if (dup) throw badRequest("A college with this name already exists");
  return prisma.college.create({ data: { universityId: university.id, name, code: body.code?.trim() || null } });
}

export async function updateCollege(id: string, body: { name?: string; code?: string | null }) {
  const c = await prisma.college.findUnique({ where: { id } });
  if (!c || c.isDeleted) throw notFound("College not found");
  return prisma.college.update({ where: { id }, data: { name: body.name?.trim() || undefined, code: body.code === undefined ? undefined : body.code?.trim() || null } });
}

/** Removes an empty college. One that still has people or departments cannot be removed. */
export async function deleteCollege(id: string) {
  const c = await prisma.college.findUnique({ where: { id } });
  if (!c || c.isDeleted) throw notFound("College not found");
  const [users, departments] = await runUnscoped(() =>
    Promise.all([prisma.user.count({ where: { collegeId: id, isDeleted: false } }), prisma.department.count({ where: { collegeId: id, isDeleted: false } })])
  );
  if (users > 0 || departments > 0) throw badRequest("Remove or move this college's people and departments first.");
  await prisma.college.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
}

export async function getUniversity() {
  const u = await prisma.university.findFirst({ orderBy: { createdAt: "asc" } });
  if (!u) throw notFound("There is no university yet");
  return u;
}

export async function updateUniversity(body: { name?: string; code?: string | null }) {
  const u = await getUniversity();
  return prisma.university.update({ where: { id: u.id }, data: { name: body.name?.trim() || undefined, code: body.code === undefined ? undefined : body.code?.trim() || null } });
}

/** The president's and admin's view: every college with its size, its own current term, and what it has locked. */
export async function universityOverview() {
  return runUnscoped(async () => {
    const [university, colleges, years] = await Promise.all([
      getUniversity(),
      prisma.college.findMany({ where: { isDeleted: false }, orderBy: { name: "asc" } }),
      prisma.academicYear.findMany({ where: { isDeleted: false }, select: { id: true, name: true } }),
    ]);
    const count = async (model: "department" | "user" | "studentClass" | "room" | "subject" | "curriculum") => {
      // the delegates share groupBy({ by: ["collegeId"], where })
      const delegate = (prisma as unknown as Record<string, { groupBy: (a: object) => Promise<{ collegeId: string | null; _count: { _all: number } }[]> }>)[model];
      const rows = await delegate.groupBy({ by: ["collegeId"], where: { isDeleted: false }, _count: { _all: true } });
      return new Map(rows.map((r) => [r.collegeId, r._count._all]));
    };
    const [departments, users, classes, rooms, subjects, curricula] = await Promise.all([
      count("department"),
      count("user"),
      count("studentClass"),
      count("room"),
      count("subject"),
      count("curriculum"),
    ]);
    const rows = await Promise.all(
      colleges.map(async (c) => {
        const year = years.find((y) => y.id === c.currentAcademicYearId);
        const term = year && c.currentSemester ? { academicYearId: year.id, name: year.name, semester: c.currentSemester } : null;
        const [blocks, locks] = term
          ? await Promise.all([
              prisma.facultyLoad.count({ where: { collegeId: c.id, academicYearId: term.academicYearId, semester: term.semester } }),
              prisma.termLock.findMany({ where: { collegeId: c.id, academicYearId: term.academicYearId }, select: { semester: true } }),
            ])
          : [0, [] as { semester: number }[]];
        return {
          id: c.id,
          name: c.name,
          code: c.code,
          currentTerm: term,
          departments: departments.get(c.id) ?? 0,
          users: users.get(c.id) ?? 0,
          studentClasses: classes.get(c.id) ?? 0,
          rooms: rooms.get(c.id) ?? 0,
          subjects: subjects.get(c.id) ?? 0,
          curricula: curricula.get(c.id) ?? 0,
          blocksThisTerm: blocks,
          lockedSemesters: locks.map((l) => l.semester).sort(),
        };
      })
    );
    return { university, colleges: rows };
  });
}
