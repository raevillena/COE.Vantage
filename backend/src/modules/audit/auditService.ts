import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { currentActor } from "../../utils/auditContext.js";

/** Kinds of record the history covers. The value is stored; the label is what people read. */
export const ENTITY_LABEL: Record<string, string> = {
  ACADEMIC_YEAR: "Academic year",
  CURRICULUM: "Curriculum",
  SUBJECT: "Subject",
  STUDENT_CLASS: "Student class",
  DEPARTMENT: "Department",
  ROOM: "Room",
  USER: "User",
  SCHEDULING_RULE: "Scheduling rule",
  SCHEDULE_BLOCK: "Schedule",
  GE_SHEET: "GE sheet",
  DELOADING: "Deloading",
  COLLEGE: "College",
};

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "RESTORE"
  | "PERMANENT_DELETE"
  | "LOCK"
  | "UNLOCK"
  | "SET_CURRENT_TERM"
  | "OPEN"
  | "CLOSE"
  | "IMPORT";

const VERB: Record<AuditAction, string> = {
  CREATE: "Created",
  UPDATE: "Changed",
  DELETE: "Deleted",
  RESTORE: "Restored",
  PERMANENT_DELETE: "Permanently deleted",
  LOCK: "Locked",
  UNLOCK: "Unlocked",
  SET_CURRENT_TERM: "Set the current term:",
  OPEN: "Opened",
  CLOSE: "Closed",
  IMPORT: "Imported",
};

/** Never copied into the history, whatever the record. */
const SECRET_FIELDS = new Set(["passwordHash", "experimentalFeatures"]);
/** Bookkeeping that is not a change worth showing. */
const NOISE_FIELDS = new Set(["createdAt", "updatedAt", "deletedAt"]);

export interface AuditEntryInput {
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  action: AuditAction;
  summary?: string;
  changes?: Record<string, { from?: unknown; to?: unknown }> | null;
  academicYearId?: string | null;
  semester?: number | null;
  /** College the record belongs to; leave out to use the person's college, null for university level. */
  collegeId?: string | null;
}

/**
 * Appends one entry to the history. The person is taken from the current request and copied (name, email, role,
 * department), so the entry stays as it was even if they later change role or leave. Best effort: a failure is
 * logged and never breaks the change that was just made.
 */
export async function audit(entry: AuditEntryInput): Promise<void> {
  try {
    const actor = currentActor();
    const noun = (ENTITY_LABEL[entry.entityType] ?? entry.entityType).toLowerCase();
    await prisma.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? "System",
        actorEmail: actor?.email ?? null,
        actorRole: actor?.role ?? "SYSTEM",
        actorDepartmentId: actor?.departmentId ?? null,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        entityLabel: entry.entityLabel ?? null,
        action: entry.action,
        summary: entry.summary ?? `${VERB[entry.action]} ${noun}${entry.entityLabel ? ` ${entry.entityLabel}` : ""}`,
        changes: (entry.changes ?? undefined) as Prisma.InputJsonValue | undefined,
        academicYearId: entry.academicYearId ?? null,
        semester: entry.semester ?? null,
        collegeId: entry.collegeId !== undefined ? entry.collegeId : actor?.collegeId ?? null,
      },
    });
  } catch (e) {
    console.error("audit failed", e);
  }
}

type Row = Record<string, unknown>;
export type AuditModel = "college" | "academicYear" | "curriculum" | "subject" | "studentClass" | "department" | "room" | "user" | "schedulingRuleSet";

async function snapshot(model: AuditModel, id: string): Promise<Row | null> {
  // the delegates share findUnique({ where: { id } }); the typed client has no common signature for them
  const delegate = (prisma as unknown as Record<string, { findUnique: (a: { where: { id: string } }) => Promise<Row | null> }>)[model];
  try {
    return await delegate.findUnique({ where: { id } });
  } catch {
    return null;
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function scalarFields(row: Row | null, only?: string[]): string[] {
  if (!row) return [];
  return Object.keys(row).filter((k) => !SECRET_FIELDS.has(k) && !NOISE_FIELDS.has(k) && (!only || only.includes(k)));
}

export interface AuditedSpec {
  entityType: string;
  model: AuditModel;
  action: AuditAction;
  /** Existing record (edit, delete, restore). Leave out for a create: the id comes from what `run` returns. */
  id?: string;
  /** Limit the before/after comparison to these fields. */
  fields?: string[];
  label: (row: Row) => string;
  summary?: string;
}

/**
 * Runs a change and records it: reads the record before and after, lists the fields that changed, and appends the
 * entry once the change has succeeded. If `run` throws, nothing is recorded.
 */
export async function audited<T>(spec: AuditedSpec, run: () => Promise<T>): Promise<T> {
  const before = spec.id ? await snapshot(spec.model, spec.id) : null;
  const result = await run();
  const entityId = spec.id ?? ((result as { id?: string } | null | undefined)?.id ?? null);
  const after = entityId && spec.action !== "PERMANENT_DELETE" ? await snapshot(spec.model, entityId) : null;

  const changes: Record<string, { from?: unknown; to?: unknown }> = {};
  if (spec.action === "CREATE") {
    for (const k of scalarFields(after, spec.fields)) if (after![k] != null && k !== "id") changes[k] = { to: after![k] };
  } else if (spec.action === "PERMANENT_DELETE") {
    for (const k of scalarFields(before, spec.fields)) if (before![k] != null && k !== "id") changes[k] = { from: before![k] };
  } else {
    const keys = spec.action === "UPDATE" ? scalarFields(after ?? before, spec.fields) : ["isDeleted"];
    for (const k of keys) if (!same(before?.[k], after?.[k])) changes[k] = { from: before?.[k], to: after?.[k] };
  }

  const row = after ?? before;
  await audit({
    entityType: spec.entityType,
    entityId,
    entityLabel: row ? spec.label(row) : null,
    collegeId: ((row as { collegeId?: string | null } | null)?.collegeId) ?? null,
    action: spec.action,
    summary: spec.summary,
    changes: Object.keys(changes).length ? changes : null,
  });
  return result;
}

// ---------------------------------------------------------------- reading

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  action?: string;
  actorId?: string;
  q?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

function whereOf(q: Omit<AuditQuery, "page" | "pageSize">): Prisma.AuditLogWhereInput {
  // a dean or secretary reads their own college's entries and the university-level ones; the admin and president read all
  const mine = currentActor()?.collegeId;
  const types = q.entityType?.split(",").map((t) => t.trim()).filter(Boolean);
  const search = q.q?.trim();
  return {
    ...(mine ? { OR: [{ collegeId: mine }, { collegeId: null }] } : {}),
    ...(types?.length ? { entityType: { in: types } } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.from || q.to
      ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { summary: { contains: search, mode: "insensitive" } },
            { entityLabel: { contains: search, mode: "insensitive" } },
            { actorName: { contains: search, mode: "insensitive" } },
            { actorEmail: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listAudit(q: AuditQuery) {
  const where = whereOf(q);
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

const EXPORT_LIMIT = 5000;

function csvCell(v: unknown): string {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // a cell that starts with = + - @ would run as a formula in a spreadsheet
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function exportAuditCsv(q: Omit<AuditQuery, "page" | "pageSize">): Promise<string> {
  const rows = await prisma.auditLog.findMany({ where: whereOf(q), orderBy: { createdAt: "desc" }, take: EXPORT_LIMIT });
  const head = ["When", "Who", "Email", "Role", "Action", "Record kind", "Record", "Summary", "Changes"];
  const lines = rows.map((r) =>
    [r.createdAt.toISOString(), r.actorName, r.actorEmail, r.actorRole, r.action, ENTITY_LABEL[r.entityType] ?? r.entityType, r.entityLabel, r.summary, r.changes]
      .map(csvCell)
      .join(",")
  );
  return [head.join(","), ...lines].join("\r\n");
}
