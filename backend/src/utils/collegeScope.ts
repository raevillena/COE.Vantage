import type { PrismaClient } from "@prisma/client";
import { badRequest } from "./errors.js";
import { currentActor, isUnscoped, runUnscoped, type AuditActor } from "./auditContext.js";

/**
 * College isolation. Every record below carries a `collegeId`. While a person who belongs to a college is signed in,
 * every query on these models is limited to their college and every new record is stamped with it, so one college can
 * never read or change another college's data by accident. The admin and the president belong to no college and see all.
 * Use `runUnscoped` (auditContext.ts) for the few places that must look across colleges.
 */
export const SCOPED_MODELS = new Set([
  "User",
  "Department",
  "Curriculum",
  "Subject",
  "StudentClass",
  "Room",
  "FacultyLoad",
  "SchedulingRuleSet",
  "GeOfferingSet",
  "TermLock",
  "CrossDepartmentLoadRequest",
]);

const FILTER_ACTIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

type Data = Record<string, unknown>;

/** The college of the record a new record hangs off (department, curriculum or class), when there is one. */
async function parentCollege(client: PrismaClient, model: string, data: Data): Promise<string | null | undefined> {
  const pick = async (table: "department" | "curriculum" | "studentClass", id: unknown) => {
    if (typeof id !== "string") return undefined;
    // the delegates share findUnique({ where: { id }, select: { collegeId } })
    const delegate = (client as unknown as Record<string, { findUnique: (a: object) => Promise<{ collegeId: string | null } | null> }>)[table];
    const row = await runUnscoped(() => delegate.findUnique({ where: { id }, select: { collegeId: true } }));
    return row?.collegeId ?? undefined;
  };
  switch (model) {
    case "Curriculum":
    case "Room":
    case "SchedulingRuleSet":
    case "User":
      return pick("department", data.departmentId);
    case "Subject":
      return (await pick("curriculum", data.curriculumId)) ?? (await pick("department", data.departmentId));
    case "StudentClass":
      return pick("curriculum", data.curriculumId);
    case "FacultyLoad":
    case "CrossDepartmentLoadRequest":
      return pick("studentClass", data.studentClassId);
    default:
      return undefined;
  }
}

/** The only college, when there is exactly one (so single-college installs never have to choose). */
export async function soleCollegeId(client: PrismaClient): Promise<string | null> {
  const rows = await runUnscoped(() => client.college.findMany({ where: { isDeleted: false }, select: { id: true }, take: 2 }));
  return rows.length === 1 ? rows[0].id : null;
}

/** The college a new record belongs to: the one asked for, else the signed-in person's, else the only college. */
export async function resolveCollegeId(client: PrismaClient, explicit?: string | null): Promise<string> {
  const id = explicit ?? currentActor()?.collegeId ?? (await soleCollegeId(client));
  if (!id) throw badRequest("Choose a college for this record.");
  return id;
}

async function collegeForNew(client: PrismaClient, model: string, data: Data, actor: AuditActor | undefined): Promise<string | null | undefined> {
  if (data.collegeId !== undefined || data.college !== undefined) return undefined; // already decided
  if (model === "User" && (data.role === "ADMIN" || data.role === "PRESIDENT")) return undefined; // span colleges
  const fromParent = await parentCollege(client, model, data);
  if (fromParent) return fromParent;
  if (actor?.collegeId) return actor.collegeId;
  if (!actor) return undefined; // scripts and seeds set the college themselves
  const sole = await soleCollegeId(client);
  if (sole) return sole;
  throw badRequest("Choose a college for this record.");
}

/** Installs the college filter and the new-record stamp on a client. Call once. */
export function installCollegeScope(client: PrismaClient): void {
  client.$use(async (params, next) => {
    const model = params.model;
    if (!model || !SCOPED_MODELS.has(model) || isUnscoped()) return next(params);
    const actor = currentActor();
    const action = params.action;
    params.args = params.args ?? {};

    // stamp new records
    if (action === "create" || action === "upsert" || action === "createMany") {
      const rows: Data[] =
        action === "create" ? [params.args.data]
        : action === "upsert" ? [params.args.create]
        : Array.isArray(params.args.data) ? params.args.data : [params.args.data];
      for (const row of rows) {
        if (!row) continue;
        const id = await collegeForNew(client, model, row, actor);
        if (id) row.collegeId = id;
      }
    }

    // keep a college-bound person inside their college
    const bound = actor?.collegeId;
    if (bound && FILTER_ACTIONS.has(action)) {
      params.args.where = { ...(params.args.where ?? {}), collegeId: bound };
    }
    return next(params);
  });
}
