import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import { buildGroups } from "./geParser.js";
import { notifyUsers, userIdsWithRole } from "../notifications/notificationService.js";
import { resolveCollegeId } from "../../utils/collegeScope.js";
import type { GeParseResult, GeRow } from "./geParser.js";

const meta = (s: { id: string; academicYearId: string; semester: number; rowCount: number; sourceName: string | null; uploadedByName: string | null; updatedAt: Date }) => ({
  id: s.id,
  academicYearId: s.academicYearId,
  semester: s.semester,
  rowCount: s.rowCount,
  sourceName: s.sourceName,
  uploadedByName: s.uploadedByName,
  updatedAt: s.updatedAt,
});

/** The college GE sheet of a term, in the shape the import reads (rows, groups), or `exists: false`. */
export async function getCollegeSet(academicYearId: string, semester: number, explicitCollegeId?: string | null) {
  const collegeId = await resolveCollegeId(prisma, explicitCollegeId);
  const set = await prisma.geOfferingSet.findFirst({ where: { collegeId, academicYearId, semester } });
  if (!set) return { exists: false as const };
  const rows = set.rows as unknown as GeRow[];
  return { exists: true as const, set: meta(set), rows, groups: buildGroups(rows), warnings: [] as string[] };
}

/** Replaces the term's college GE sheet with freshly parsed rows. */
export async function saveCollegeSet(
  academicYearId: string,
  semester: number,
  parsed: GeParseResult,
  info: { sourceName: string | null; uploadedByName: string; collegeId?: string | null }
) {
  if (parsed.rows.length === 0) throw badRequest("The sheet has no course rows");
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true, isDeleted: true } });
  if (!year || year.isDeleted) throw notFound("Academic year not found");
  const data = { rows: parsed.rows as unknown as object, rowCount: parsed.rows.length, sourceName: info.sourceName, uploadedByName: info.uploadedByName };
  const collegeId = await resolveCollegeId(prisma, info.collegeId);
  const existing = await prisma.geOfferingSet.findFirst({ where: { collegeId, academicYearId, semester } });
  const set = existing
    ? await prisma.geOfferingSet.update({ where: { id: existing.id }, data })
    : await prisma.geOfferingSet.create({ data: { collegeId, academicYearId, semester, ...data } });
  void userIdsWithRole("CHAIRMAN").then((ids) =>
    notifyUsers(ids, {
      type: "GE_SHEET",
      title: "The college GE sheet was updated",
      body: `${parsed.rows.length} rows for the ${["", "1st semester", "2nd semester", "Mid year"][semester] ?? "semester " + semester}. Import it from the scheduler.`,
      link: "/scheduler",
      groupKey: "ge-sheet",
    })
  );
  return { set: meta(set), rows: parsed.rows, groups: parsed.groups, warnings: parsed.warnings };
}

export async function deleteCollegeSet(academicYearId: string, semester: number, explicitCollegeId?: string | null) {
  const collegeId = await resolveCollegeId(prisma, explicitCollegeId);
  const res = await prisma.geOfferingSet.deleteMany({ where: { collegeId, academicYearId, semester } });
  if (res.count === 0) throw notFound("Nothing is uploaded for this term");
}
