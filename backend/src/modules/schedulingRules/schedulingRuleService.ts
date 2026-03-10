import { prisma } from "../../prisma/client.js";
import { notFound, forbidden } from "../../utils/errors.js";
import type { SchedulingRuleSetConfig } from "./schedulingRuleTypes.js";
import { normalizeConfig, DEFAULT_SCHEDULING_CONFIG } from "./schedulingRuleTypes.js";

export type CallerContext = { role: string; departmentId: string | null };

/**
 * Resolve which rule set applies for (academicYearId, studentClassId).
 * Order: (year, class) exact > (year, null) > (null, class) > first system default.
 */
export async function resolveRuleSetFor(
  academicYearId: string,
  studentClassId: string
): Promise<{ ruleSetId: string; ruleSetName: string; config: SchedulingRuleSetConfig } | null> {
  for (const [ay, sc] of [
    [academicYearId, studentClassId],
    [academicYearId, null],
    [null, studentClassId],
  ] as const) {
    // NOTE: academicYearId or studentClassId may be null here (year-only or class-only assignments),
    // so we must use findFirst with a simple where clause instead of findUnique on the composite key,
    // because Prisma does not allow nulls in the unique criteria.
    const assignment = await prisma.schedulingRuleSetAssignment.findFirst({
      where: { academicYearId: ay, studentClassId: sc },
      include: { ruleSet: true },
    });
    if (assignment?.ruleSet) {
      return {
        ruleSetId: assignment.ruleSet.id,
        ruleSetName: assignment.ruleSet.name,
        config: normalizeConfig(assignment.ruleSet.config),
      };
    }
  }

  const defaultSet = await prisma.schedulingRuleSet.findFirst({
    where: { isSystem: true },
    orderBy: { createdAt: "asc" },
  });
  if (defaultSet) {
    return {
      ruleSetId: defaultSet.id,
      ruleSetName: defaultSet.name,
      config: normalizeConfig(defaultSet.config),
    };
  }
  return null;
}

/** Get config for auto-schedule; returns default if no rule set resolved. */
export async function getConfigForAutoAssign(
  academicYearId: string,
  studentClassId: string
): Promise<SchedulingRuleSetConfig> {
  const resolved = await resolveRuleSetFor(academicYearId, studentClassId);
  return resolved?.config ?? DEFAULT_SCHEDULING_CONFIG;
}

/** Get config by rule set id (for override when running auto-assign). */
export async function getRuleSetConfigById(ruleSetId: string): Promise<SchedulingRuleSetConfig> {
  const set = await prisma.schedulingRuleSet.findUnique({
    where: { id: ruleSetId },
  });
  if (!set) throw notFound("Scheduling rule set not found");
  return normalizeConfig(set.config);
}

export async function listRuleSets(caller: CallerContext) {
  const where: {
    isSystem?: boolean;
    departmentId?: string | null;
    OR?: { departmentId: string | null }[];
  } = {};

  if (caller.role === "CHAIRMAN" && caller.departmentId) {
    // Chairman sees their department's sets plus global (null department)
    where.OR = [{ departmentId: caller.departmentId }, { departmentId: null }];
  } else if (caller.role !== "ADMIN") {
    // Other non-admin roles only see global sets
    where.departmentId = null;
  }

  return prisma.schedulingRuleSet.findMany({
    where,
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      config: true,
      departmentId: true,
      isSystem: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getRuleSetById(id: string, caller: CallerContext) {
  const set = await prisma.schedulingRuleSet.findUnique({
    where: { id },
    include: { assignments: { include: { academicYear: true, studentClass: true } } },
  });
  if (!set) throw notFound("Scheduling rule set not found");
  if (set.isSystem && caller.role === "CHAIRMAN") {
    if (set.departmentId && set.departmentId !== caller.departmentId) throw forbidden("Access denied");
  } else if (set.departmentId && caller.role === "CHAIRMAN" && set.departmentId !== caller.departmentId) {
    throw forbidden("Access denied");
  }
  return set;
}

export async function createRuleSet(
  body: { name: string; description?: string; config: SchedulingRuleSetConfig },
  caller: CallerContext
) {
  if (caller.role !== "ADMIN" && caller.role !== "CHAIRMAN") {
    throw forbidden("Only admin or chairman can create rule sets");
  }
  // Chairman rule sets must always be department-scoped. If chairman has no department, disallow.
  const departmentId =
    caller.role === "CHAIRMAN"
      ? caller.departmentId ?? (() => { throw forbidden("Chairman must belong to a department to create rule sets"); })()
      : null;
  return prisma.schedulingRuleSet.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      config: body.config as object,
      departmentId,
      isSystem: false,
    },
  });
}

export async function updateRuleSet(
  id: string,
  body: { name?: string; description?: string; config?: SchedulingRuleSetConfig },
  caller: CallerContext
) {
  const existing = await prisma.schedulingRuleSet.findUnique({ where: { id } });
  if (!existing) throw notFound("Scheduling rule set not found");
  if (existing.isSystem) throw forbidden("System rule set cannot be edited");
  // Chairman may only edit rule sets in their own department; global (null) and other departments are admin-only.
  if (caller.role === "CHAIRMAN" && existing.departmentId !== caller.departmentId) {
    throw forbidden("Access denied");
  }
  return prisma.schedulingRuleSet.update({
    where: { id },
    data: {
      ...(body.name != null && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.config != null && { config: body.config as object }),
    },
  });
}

export async function deleteRuleSet(id: string, caller: CallerContext) {
  const existing = await prisma.schedulingRuleSet.findUnique({ where: { id } });
  if (!existing) throw notFound("Scheduling rule set not found");
  if (existing.isSystem) throw forbidden("System rule set cannot be deleted");
  // Chairman may only delete rule sets in their own department; global (null) and other departments are admin-only.
  if (caller.role === "CHAIRMAN" && existing.departmentId !== caller.departmentId) {
    throw forbidden("Access denied");
  }
  await prisma.schedulingRuleSetAssignment.deleteMany({ where: { ruleSetId: id } });
  await prisma.schedulingRuleSet.delete({ where: { id } });
}

export async function listAssignments(caller: CallerContext) {
  const assignments = await prisma.schedulingRuleSetAssignment.findMany({
    include: {
      ruleSet: { select: { id: true, name: true } },
      academicYear: { select: { id: true, name: true } },
      studentClass: { select: { id: true, name: true, curriculumId: true } },
    },
    orderBy: [{ academicYearId: "asc" }, { studentClassId: "asc" }],
  });
  if (caller.role === "CHAIRMAN" && caller.departmentId) {
    return assignments.filter((a) => {
      const set = a.ruleSet as { departmentId?: string | null };
      return set.departmentId === caller.departmentId || set.departmentId == null;
    });
  }
  return assignments;
}

export async function setAssignment(
  body: { academicYearId?: string | null; studentClassId?: string | null; ruleSetId: string },
  caller: CallerContext
) {
  if (caller.role !== "ADMIN" && caller.role !== "CHAIRMAN") {
    throw forbidden("Only admin or chairman can set assignments");
  }
  const ruleSet = await prisma.schedulingRuleSet.findUnique({ where: { id: body.ruleSetId } });
  if (!ruleSet) throw notFound("Scheduling rule set not found");
  if (ruleSet.departmentId && caller.role === "CHAIRMAN" && ruleSet.departmentId !== caller.departmentId) {
    throw forbidden("Access denied");
  }
  const academicYearId = body.academicYearId ?? null;
  const studentClassId = body.studentClassId ?? null;

  // Prisma's compound unique doesn't accept null in upsert where, so use findFirst + create/update for (year, null) or (null, class).
  const existing = await prisma.schedulingRuleSetAssignment.findFirst({
    where: {
      academicYearId,
      studentClassId,
    },
  });
  if (existing) {
    await prisma.schedulingRuleSetAssignment.update({
      where: { id: existing.id },
      data: { ruleSetId: body.ruleSetId },
    });
  } else {
    await prisma.schedulingRuleSetAssignment.create({
      data: {
        academicYearId,
        studentClassId,
        ruleSetId: body.ruleSetId,
      },
    });
  }
}

export async function removeAssignment(academicYearId: string | null, studentClassId: string | null, caller: CallerContext) {
  // Only admin can remove assignments; chairmen override admin defaults by adding more specific assignments.
  if (caller.role !== "ADMIN") {
    throw forbidden("Only admin can remove assignments");
  }
  await prisma.schedulingRuleSetAssignment.deleteMany({
    where: { academicYearId, studentClassId },
  });
}
