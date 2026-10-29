import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client.js";
import { forbidden } from "./errors.js";
import { scopeCollegeId } from "./auditContext.js";

const SEMESTER_LABEL = ["", "1st Sem", "2nd Sem", "Mid Year"];

/**
 * A locked term (a college's semester of an academic year) takes no scheduling changes from anyone until the admin,
 * dean or college secretary of that college unlocks it. Call this before a write that belongs to a term, with the
 * college of the record being changed (it defaults to the signed-in person's college).
 */
export async function assertTermUnlocked(
  academicYearId: string,
  semester: number,
  collegeId?: string | null,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const college = collegeId ?? scopeCollegeId();
  if (!college) return; // nothing to check against: the admin acting on a record without a college
  const lock = await (tx ?? prisma).termLock.findFirst({
    where: { academicYearId, semester, collegeId: college },
    include: { academicYear: { select: { name: true } } },
  });
  if (lock) {
    throw forbidden(
      `${lock.academicYear.name}, ${SEMESTER_LABEL[semester] ?? `semester ${semester}`} is locked by ${lock.lockedByName}. ` +
        "No changes can be made until the admin, dean or college secretary unlocks it."
    );
  }
}
