import { Prisma, type Role } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { AppError, badRequest, forbidden, notFound } from "../../utils/errors.js";
import { runUnscoped } from "../../utils/auditContext.js";
import { env } from "../../config/env.js";
import { sendGradeAccessEmail } from "../../utils/email.js";
import type {
  CreateGradeRecordBody,
  CreateGradeSubjectBody,
  ImportGradeRecordsBody,
  SendAccessCodesBody,
  PublicComputeRecordBody,
  UpdateGradeRecordBody,
  UpdateGradeSubjectBody,
  UpsertViewerBody,
} from "./gradeSubjectSchemas.js";
import { parseGradeRecordsFromCsvText, parseGradeRecordsFromRows, type GradeImportRecord } from "../../utils/gradeCsvImport.js";
import { toGoogleSheetsCsvExportUrl } from "../../utils/googleSheetsExportUrl.js";
import { readFirstSheetAsRows } from "../../utils/gradeExcelImport.js";
import { applyGradePolicy } from "../../utils/gradePolicy.js";
import { newGradeRecordAccessCode } from "../../utils/gradeAccessCode.js";
import { gradingSystemV1Schema, mergeGradingSystemJson } from "../../utils/gradingSystemSchema.js";

type Caller = {
  id: string;
  role: "ADMIN" | "DEAN" | "CHAIRMAN" | "FACULTY" | "OFFICER" | "COLLEGE_SECRETARY" | "PRESIDENT" | "UNIT";
  departmentId: string | null;
};

function canCreateSubject(caller: Caller): boolean {
  return caller.role === "ADMIN" || caller.role === "DEAN" || caller.role === "CHAIRMAN" || caller.role === "FACULTY";
}

async function loadSubjectAccess(subjectId: string, caller: Caller) {
  const subject = await prisma.gradeSubject.findUnique({
    where: { id: subjectId },
    include: {
      owner: { select: { id: true, role: true, departmentId: true, name: true } },
      academicYear: { select: { id: true, name: true } },
      viewers: { where: { userId: caller.id }, select: { canEdit: true } },
    },
  });
  if (!subject || subject.isDeleted) throw notFound("Grade subject not found");
  const isAdmin = caller.role === "ADMIN";
  const isOwner = subject.ownerId === caller.id;
  const viewer = subject.viewers[0];
  return { subject, isAdmin, isOwner, viewer };
}

function assertReadAccess(access: Awaited<ReturnType<typeof loadSubjectAccess>>) {
  if (!access.isAdmin && !access.isOwner && !access.viewer) {
    throw forbidden("You do not have access to this grade subject");
  }
}

function assertWriteAccess(access: Awaited<ReturnType<typeof loadSubjectAccess>>) {
  if (!access.isAdmin && !access.isOwner && !access.viewer?.canEdit) {
    throw forbidden("You do not have write access to this grade subject");
  }
}

export async function listGradeSubjects(caller: Caller) {
  const where =
    caller.role === "ADMIN"
      ? { isDeleted: false }
      : {
          isDeleted: false,
          OR: [{ ownerId: caller.id }, { viewers: { some: { userId: caller.id } } }],
        };

  return prisma.gradeSubject.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true, role: true, departmentId: true } },
      department: { select: { id: true, name: true, code: true } },
      academicYear: { select: { id: true, name: true } },
      _count: { select: { records: true, viewers: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** The year must exist, and a semester only makes sense with a year. */
async function checkTerm(academicYearId: string | null | undefined, semester: number | null | undefined) {
  if (academicYearId) {
    const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
    if (!year || year.isDeleted) throw badRequest("Academic year not found");
  }
  if (semester != null && !academicYearId) throw badRequest("Choose an academic year for the semester");
}

export async function createGradeSubject(caller: Caller, body: CreateGradeSubjectBody) {
  if (!canCreateSubject(caller)) throw forbidden("Your role cannot create grade subjects");
  if (body.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!dept || dept.isDeleted) throw badRequest("Department not found");
  }
  await checkTerm(body.academicYearId, body.semester);
  return prisma.gradeSubject.create({
    data: {
      name: body.name,
      code: body.code ?? undefined,
      ownerId: caller.id,
      departmentId: body.departmentId ?? caller.departmentId ?? undefined,
      academicYearId: body.academicYearId ?? undefined,
      semester: body.semester ?? undefined,
      gradingSystem:
        body.gradingSystem == null ? undefined : (body.gradingSystem as unknown as Prisma.InputJsonValue),
      studentComputeEnabled: body.studentComputeEnabled ?? false,
    },
    include: {
      owner: { select: { id: true, name: true, role: true, departmentId: true } },
      department: { select: { id: true, name: true, code: true } },
      academicYear: { select: { id: true, name: true } },
      _count: { select: { records: true, viewers: true } },
    },
  });
}

export async function getGradeSubjectById(subjectId: string, caller: Caller) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertReadAccess(access);
  const { viewers: _v, ...subject } = access.subject;
  return subject;
}

export async function updateGradeSubject(subjectId: string, caller: Caller, body: UpdateGradeSubjectBody) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertWriteAccess(access);

  if (body.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!dept || dept.isDeleted) throw badRequest("Department not found");
  }

  // Clearing the year clears the semester with it; otherwise the pair after this change must still make sense.
  const nextYear = body.academicYearId !== undefined ? body.academicYearId : access.subject.academicYearId;
  const semesterUpdate = body.academicYearId === null && body.semester === undefined ? null : body.semester;
  const nextSemester = semesterUpdate !== undefined ? semesterUpdate : access.subject.semester;
  await checkTerm(nextYear, nextSemester);

  let gradingSystemUpdate: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
  if (body.gradingSystem === undefined) {
    gradingSystemUpdate = undefined;
  } else if (body.gradingSystem === null) {
    gradingSystemUpdate = Prisma.JsonNull;
  } else {
    const merged = mergeGradingSystemJson(access.subject.gradingSystem, body.gradingSystem as Record<string, unknown>);
    const validated = gradingSystemV1Schema.safeParse(merged);
    if (!validated.success) {
      const msg = validated.error.issues.map((i) => i.message).join("; ");
      throw badRequest(msg || "Invalid grading system");
    }
    gradingSystemUpdate = validated.data as unknown as Prisma.InputJsonValue;
  }

  return prisma.gradeSubject.update({
    where: { id: subjectId },
    data: {
      name: body.name,
      code: body.code,
      departmentId: body.departmentId,
      academicYearId: body.academicYearId,
      semester: semesterUpdate,
      gradingSystem: gradingSystemUpdate,
      studentComputeEnabled: body.studentComputeEnabled,
    },
    include: {
      owner: { select: { id: true, name: true, role: true, departmentId: true } },
      department: { select: { id: true, name: true, code: true } },
      academicYear: { select: { id: true, name: true } },
      _count: { select: { records: true, viewers: true } },
    },
  });
}

export async function deleteGradeSubject(subjectId: string, caller: Caller) {
  const access = await loadSubjectAccess(subjectId, caller);
  if (!access.isAdmin && !access.isOwner) throw forbidden("Only owner or admin can delete this grade subject");
  await prisma.gradeSubject.update({
    where: { id: subjectId },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

export async function listViewers(subjectId: string, caller: Caller) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertReadAccess(access);
  return prisma.gradeSubjectViewer.findMany({
    where: { subjectId },
    include: { user: { select: { id: true, name: true, email: true, role: true, departmentId: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function listViewerCandidates(subjectId: string, caller: Caller) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertReadAccess(access);
  const subjectDepartmentId = access.subject.departmentId ?? access.subject.owner.departmentId ?? null;
  const where =
    caller.role === "ADMIN"
      ? { isDeleted: false, id: { not: access.subject.ownerId } }
      : {
          isDeleted: false,
          id: { not: access.subject.ownerId },
          role: { in: ["ADMIN", "DEAN", "CHAIRMAN", "FACULTY"] as Role[] },
          OR: [{ departmentId: subjectDepartmentId }, { role: "ADMIN" as const }],
        };

  return prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, role: true, departmentId: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

export async function upsertViewer(subjectId: string, caller: Caller, body: UpsertViewerBody) {
  const access = await loadSubjectAccess(subjectId, caller);
  if (!access.isAdmin && !access.isOwner) throw forbidden("Only owner or admin can manage viewers");
  if (body.userId === access.subject.ownerId) throw badRequest("Owner already has full access");

  const user = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!user || user.isDeleted) throw badRequest("User not found");

  await prisma.gradeSubjectViewer.upsert({
    where: { subjectId_userId: { subjectId, userId: body.userId } },
    create: { subjectId, userId: body.userId, canEdit: body.canEdit ?? false },
    update: { canEdit: body.canEdit ?? false },
  });
}

export async function removeViewer(subjectId: string, userId: string, caller: Caller) {
  const access = await loadSubjectAccess(subjectId, caller);
  if (!access.isAdmin && !access.isOwner) throw forbidden("Only owner or admin can manage viewers");
  await prisma.gradeSubjectViewer.deleteMany({ where: { subjectId, userId } });
}

export async function listRecords(subjectId: string, caller: Caller) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertReadAccess(access);
  return prisma.gradeRecord.findMany({
    where: { subjectId },
    orderBy: [{ studentName: "asc" }, { createdAt: "asc" }],
  });
}

export async function createRecord(subjectId: string, caller: Caller, body: CreateGradeRecordBody) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertWriteAccess(access);
  const code = body.code?.trim() ? body.code.trim() : newGradeRecordAccessCode();
  return prisma.gradeRecord.create({
    data: {
      subjectId,
      studentName: body.studentName,
      studentNumber: body.studentNumber,
      email: body.email ?? null,
      code,
      grades: body.grades,
      maxScores: body.maxScores ?? undefined,
    },
  });
}

/**
 * Full **replace** import: removes every `GradeRecord` for the subject, then inserts the payload.
 * Matches “sync from source sheet” — re-import does not append.
 */
export async function importRecords(subjectId: string, caller: Caller, body: ImportGradeRecordsBody) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertWriteAccess(access);

  return prisma.$transaction(async (tx) => {
    const removed = await tx.gradeRecord.deleteMany({ where: { subjectId } });
    if (body.records.length > 0) {
      await tx.gradeRecord.createMany({
        data: body.records.map((record) => ({
          subjectId,
          studentName: record.studentName,
          studentNumber: record.studentNumber,
          email: record.email ?? null,
          code: record.code?.trim() ? record.code.trim() : newGradeRecordAccessCode(),
          grades: record.grades,
          maxScores: record.maxScores ?? undefined,
        })),
      });
    }
    return { imported: body.records.length, removed: removed.count };
  });
}

function gradeImportRecordsToBody(records: GradeImportRecord[]): ImportGradeRecordsBody {
  return {
    records: records.map((record) => ({
      studentName: record.studentName,
      studentNumber: record.studentNumber,
      email: record.email,
      code: record.code ?? undefined,
      grades: record.grades,
      maxScores: record.maxScores,
    })),
  };
}

/** Parse UTF-8 CSV bytes (same rules as Google Sheets export + Excel sheet import). */
export async function importRecordsFromCsvBuffer(subjectId: string, caller: Caller, buffer: Buffer) {
  const text = buffer.toString("utf8");
  const { records, errors } = parseGradeRecordsFromCsvText(text);
  if (records.length === 0) {
    throw badRequest(errors[0] ?? "No valid rows in CSV");
  }
  const { imported, removed } = await importRecords(subjectId, caller, gradeImportRecordsToBody(records));
  return { imported, removed, skipped: errors.length, errors: errors.slice(0, 50) };
}

/** Fetch a Google Sheet as CSV (publish / link view) and bulk-import rows. */
export async function importRecordsFromGoogleSheet(subjectId: string, caller: Caller, sheetUrl: string) {
  const csvUrl = toGoogleSheetsCsvExportUrl(sheetUrl);
  const response = await fetch(csvUrl, {
    redirect: "follow",
    headers: { "User-Agent": "COE-Vantage-GradeImport/1.0" },
  });
  if (!response.ok) {
    throw badRequest(
      `Could not fetch sheet as CSV (HTTP ${response.status}). Share the spreadsheet so anyone with the link can view it, then paste the same link you use in the browser.`
    );
  }
  const text = await response.text();
  const { records, errors } = parseGradeRecordsFromCsvText(text);
  if (records.length === 0) {
    throw badRequest(errors[0] ?? "No valid rows in the exported CSV");
  }
  const { imported, removed } = await importRecords(subjectId, caller, gradeImportRecordsToBody(records));
  return { imported, removed, skipped: errors.length, errors: errors.slice(0, 50) };
}

/** Import the first worksheet of an .xlsx file using the same columns as CSV import. */
export async function importRecordsFromExcelBuffer(subjectId: string, caller: Caller, buffer: Buffer) {
  let rows: string[][];
  try {
    rows = await readFirstSheetAsRows(buffer);
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : "Invalid spreadsheet";
    throw badRequest(`Could not read Excel file: ${message}`);
  }
  const { records, errors } = parseGradeRecordsFromRows(rows);
  if (records.length === 0) {
    throw badRequest(errors[0] ?? "No valid rows in the spreadsheet");
  }
  const { imported, removed } = await importRecords(subjectId, caller, gradeImportRecordsToBody(records));
  return { imported, removed, skipped: errors.length, errors: errors.slice(0, 50) };
}

export async function updateRecord(
  subjectId: string,
  recordId: string,
  caller: Caller,
  body: UpdateGradeRecordBody
) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertWriteAccess(access);
  const existing = await prisma.gradeRecord.findUnique({ where: { id: recordId } });
  if (!existing || existing.subjectId !== subjectId) throw notFound("Grade record not found");
  return prisma.gradeRecord.update({
    where: { id: recordId },
    data: {
      studentName: body.studentName,
      studentNumber: body.studentNumber,
      email: body.email,
      code: body.code,
      grades: body.grades,
      maxScores:
        body.maxScores === undefined
          ? undefined
          : body.maxScores === null
            ? Prisma.JsonNull
            : (body.maxScores as unknown as Prisma.InputJsonValue),
    },
  });
}

export async function deleteRecord(subjectId: string, recordId: string, caller: Caller) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertWriteAccess(access);
  const existing = await prisma.gradeRecord.findUnique({ where: { id: recordId } });
  if (!existing || existing.subjectId !== subjectId) throw notFound("Grade record not found");
  await prisma.gradeRecord.delete({ where: { id: recordId } });
}

/** Assigns a new cryptographically random access code; clears `emailSentAt` so “sent” state matches the new code. */
export async function regenerateRecordAccessCode(subjectId: string, recordId: string, caller: Caller) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertWriteAccess(access);
  const existing = await prisma.gradeRecord.findUnique({ where: { id: recordId } });
  if (!existing || existing.subjectId !== subjectId) throw notFound("Grade record not found");
  return prisma.gradeRecord.update({
    where: { id: recordId },
    data: {
      code: newGradeRecordAccessCode(),
      emailSentAt: null,
    },
  });
}

/** Every item any of the subject's records has a score or a maximum for: the subject's score columns. */
function subjectColumnKeys(rows: { grades: unknown; maxScores: unknown }[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const source of [row.grades, row.maxScores]) {
      if (source && typeof source === "object" && !Array.isArray(source)) for (const key of Object.keys(source)) keys.add(key);
    }
  }
  return keys;
}

/**
 * `missingKeys`: the grading formula's items that are real columns of the subject but have no score on this record.
 * A blank is not a zero: any missing item makes the grade INC (incomplete) instead of a number. A score of 0 entered on
 * purpose is a score, so it computes. A formula key that is not a column of the subject at all is a settings problem and
 * does not make students INC.
 */
function computeFinal(
  gradingSystem: any,
  grades: Record<string, number>,
  maxScores?: Record<string, number>,
  columnKeys?: Set<string>
): { finalGrade: number; breakdown: unknown[]; missingKeys: string[] } {
  const categories = Array.isArray(gradingSystem?.categories) ? gradingSystem.categories : [];
  if (categories.length === 0) return { finalGrade: 0, breakdown: [], missingKeys: [] };
  const missingKeys = columnKeys
    ? formulaGradeKeys(gradingSystem).filter((key) => columnKeys.has(key) && !(typeof grades[key] === "number" && Number.isFinite(grades[key])))
    : [];

  const breakdown = categories.map((category: any) => {
    const categoryWeight = Number(category?.weight ?? 0);
    const components = Array.isArray(category?.components) ? category.components : [];
    const componentScores = components.map((component: any) => {
      const weight = Number(component?.weight ?? 0);
      const keys = Array.isArray(component?.gradeKeys) ? component.gradeKeys : [];
      let earned = 0;
      let possible = 0;
      for (const key of keys) {
        const score = Number(grades[key] ?? 0);
        const max = Number(maxScores?.[key] ?? 100);
        earned += score;
        possible += max;
      }
      const ratio = possible > 0 ? earned / possible : 0;
      return { id: component?.id, name: component?.name, weight, scorePercent: ratio * 100 };
    });
    const compSum = componentScores.reduce((s: number, c: any) => s + c.weight, 0);
    const weightedComponentScore =
      compSum > 0
        ? componentScores.reduce(
            (sum: number, c: any) => sum + c.scorePercent * (c.weight / compSum),
            0
          )
        : 0;
    return {
      id: category?.id,
      name: category?.name,
      weight: categoryWeight,
      score: weightedComponentScore,
      components: componentScores,
    };
  });

  const finalGrade = breakdown.reduce(
    (sum: number, category: any) => sum + category.score * (Number(category.weight ?? 0) / 100),
    0
  );
  return { finalGrade: Number(finalGrade.toFixed(2)), breakdown, missingKeys };
}

function buildComputedGradeJson(
  gradingSystem: unknown,
  computed: { finalGrade: number; breakdown: unknown[]; missingKeys: string[] }
): Record<string, unknown> {
  const gs = gradingSystem as Record<string, unknown> | null | undefined;
  const policy = applyGradePolicy(computed.finalGrade, gs ?? null);
  if (computed.missingKeys.length > 0) {
    // Incomplete: no number, no pass/fail. The teacher enters 0 for an item to count it as zero and compute the grade as is.
    return {
      finalGrade: null,
      incomplete: true,
      missingKeys: computed.missingKeys,
      breakdown: [],
      computedAt: new Date().toISOString(),
      letterGrade: "INC",
      remarks: "INC",
      passed: null,
      passingGrade: policy.passingGrade,
    };
  }
  return {
    finalGrade: computed.finalGrade,
    incomplete: false,
    breakdown: computed.breakdown,
    computedAt: new Date().toISOString(),
    letterGrade: policy.letterGrade,
    remarks: policy.remarks,
    passed: policy.passed,
    passingGrade: policy.passingGrade,
  };
}

export async function computeGrades(subjectId: string, caller: Caller) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertWriteAccess(access);
  const records = await prisma.gradeRecord.findMany({ where: { subjectId } });
  const columnKeys = subjectColumnKeys(records);
  const results = [];
  for (const record of records) {
    const computed = computeFinal(
      access.subject.gradingSystem,
      record.grades as Record<string, number>,
      (record.maxScores ?? undefined) as Record<string, number> | undefined,
      columnKeys
    );
    const updated = await prisma.gradeRecord.update({
      where: { id: record.id },
      data: {
        computedGrade: buildComputedGradeJson(access.subject.gradingSystem, computed) as unknown as Prisma.InputJsonValue,
      },
    });
    results.push(updated);
  }
  return results;
}

/** Same response for missing record, wrong credentials, or disabled compute — avoids leaking record existence. */
/** What the public lookup shows of a subject. The grading formula is deliberately left out. */
const PUBLIC_SUBJECT_SELECT = {
  id: true,
  name: true,
  code: true,
  studentComputeEnabled: true,
  semester: true,
  academicYear: { select: { id: true, name: true } },
} satisfies Prisma.GradeSubjectSelect;

/** Grade keys named by a grading system, in its own order (categories, then components, then keys). */
function formulaGradeKeys(gradingSystem: unknown): string[] {
  const keys: string[] = [];
  const categories = (gradingSystem as { categories?: unknown } | null)?.categories;
  if (!Array.isArray(categories)) return keys;
  for (const category of categories) {
    const components = (category as { components?: unknown } | null)?.components;
    if (!Array.isArray(components)) continue;
    for (const component of components) {
      const gradeKeys = (component as { gradeKeys?: unknown } | null)?.gradeKeys;
      if (!Array.isArray(gradeKeys)) continue;
      for (const key of gradeKeys) if (typeof key === "string" && key.trim() !== "" && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/**
 * Adds `items` to public records: every item the student's subject has, so the page can show the ones with no score yet.
 * An item exists once any record in the subject has a maximum or a score for it (the same rule as the staff table's columns).
 * Items the grading formula names come first, in its order, then the rest. A formula key that is not an item at all is a
 * settings problem, not something the student lacks, so it is left out. Only item names are returned, never the formula.
 */
/** "year|semester" of every college's Current Semester (its Scheduling Semester stands in until one is set). */
async function currentTermKeys(): Promise<Set<string>> {
  const colleges = await runUnscoped(() =>
    prisma.college.findMany({ where: { isDeleted: false }, select: { currentAcademicYearId: true, currentSemester: true, calendarAcademicYearId: true, calendarSemester: true } })
  );
  const keys = new Set<string>();
  for (const c of colleges) {
    const year = c.calendarAcademicYearId ?? c.currentAcademicYearId;
    const semester = c.calendarAcademicYearId ? c.calendarSemester : c.currentSemester;
    if (year && semester) keys.add(`${year}|${semester}`);
  }
  return keys;
}

async function attachExpectedItems<T extends { subjectId: string }>(records: T[]): Promise<(T & { items: string[]; isCurrentTerm: boolean })[]> {
  const subjectIds = Array.from(new Set(records.map((record) => record.subjectId)));
  if (subjectIds.length === 0) return [];
  const [subjects, rows, currentKeys] = await Promise.all([
    prisma.gradeSubject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, gradingSystem: true, academicYearId: true, semester: true } }),
    prisma.gradeRecord.findMany({ where: { subjectId: { in: subjectIds } }, select: { subjectId: true, grades: true, maxScores: true } }),
    currentTermKeys(),
  ]);
  const currentBySubject = new Map(subjects.map((subject) => [subject.id, subject.academicYearId !== null && subject.semester !== null && currentKeys.has(`${subject.academicYearId}|${subject.semester}`)]));
  const itemsBySubject = new Map<string, string[]>();
  for (const subject of subjects) {
    const others = new Set<string>();
    for (const row of rows) {
      if (row.subjectId !== subject.id) continue;
      for (const source of [row.grades, row.maxScores]) {
        if (source && typeof source === "object" && !Array.isArray(source)) for (const key of Object.keys(source)) others.add(key);
      }
    }
    const formula = formulaGradeKeys(subject.gradingSystem).filter((key) => others.has(key));
    const rest = Array.from(others)
      .filter((key) => !formula.includes(key))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    itemsBySubject.set(subject.id, [...formula, ...rest]);
  }
  return records.map((record) => ({ ...record, items: itemsBySubject.get(record.subjectId) ?? [], isCurrentTerm: currentBySubject.get(record.subjectId) ?? false }));
}

const PUBLIC_COMPUTE_NOT_AVAILABLE = "Unable to compute grades for this record.";

export async function publicComputeRecord(recordId: string, body: PublicComputeRecordBody) {
  const record = await prisma.gradeRecord.findUnique({
    where: { id: recordId },
    include: { subject: true },
  });
  if (!record) throw notFound(PUBLIC_COMPUTE_NOT_AVAILABLE);
  if (record.studentNumber !== body.studentNumber || record.code !== body.code) {
    throw notFound(PUBLIC_COMPUTE_NOT_AVAILABLE);
  }
  if (!record.subject.studentComputeEnabled) {
    throw notFound(PUBLIC_COMPUTE_NOT_AVAILABLE);
  }

  const siblings = await prisma.gradeRecord.findMany({ where: { subjectId: record.subjectId }, select: { grades: true, maxScores: true } });
  const computed = computeFinal(
    record.subject.gradingSystem,
    record.grades as Record<string, number>,
    (record.maxScores ?? undefined) as Record<string, number> | undefined,
    subjectColumnKeys(siblings)
  );

  const updated = await prisma.gradeRecord.update({
    where: { id: recordId },
    data: {
      computedGrade: buildComputedGradeJson(record.subject.gradingSystem, computed) as unknown as Prisma.InputJsonValue,
    },
    include: {
      subject: {
        select: PUBLIC_SUBJECT_SELECT,
      },
    },
  });
  return (await attachExpectedItems([updated]))[0];
}

export async function publicLookup(studentNumber: string, code: string) {
  const records = await prisma.gradeRecord.findMany({
    where: { studentNumber, code, subject: { isDeleted: false } },
    include: {
      subject: {
        // Do not expose full grading formula JSON on the public lookup surface.
        select: PUBLIC_SUBJECT_SELECT,
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return attachExpectedItems(records);
}

export async function sendAccessCodes(subjectId: string, caller: Caller, body: SendAccessCodesBody) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertWriteAccess(access);

  const where = body.recordIds?.length
    ? { subjectId, id: { in: body.recordIds } }
    : { subjectId };
  const records = await prisma.gradeRecord.findMany({ where });
  if (records.length === 0) return { sent: 0, skipped: 0 };

  const base = env.FRONTEND_ORIGIN.replace(/\/$/, "");
  let sent = 0;
  let skipped = 0;
  for (const record of records) {
    if (!record.email) {
      skipped += 1;
      continue;
    }
    const lookupUrl = `${base}/grades?studentNumber=${encodeURIComponent(record.studentNumber)}&code=${encodeURIComponent(record.code)}`;
    await sendGradeAccessEmail({
      toEmail: record.email,
      subjectName: access.subject.name,
      studentName: record.studentName,
      studentNumber: record.studentNumber,
      accessCode: record.code,
      lookupUrl,
    });
    sent += 1;
    await prisma.gradeRecord.update({
      where: { id: record.id },
      data: { emailSentAt: new Date() },
    });
  }
  return { sent, skipped };
}

