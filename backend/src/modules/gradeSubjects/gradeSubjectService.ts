import { Prisma, type Role } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../utils/errors.js";
import { runUnscoped } from "../../utils/auditContext.js";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { redis } from "../../config/redis.js";
import { isSmtpConfigured, sendGradeAccessEmail } from "../../utils/email.js";
import type {
  CreateGradeRecordBody,
  CreateGradeSubjectBody,
  ImportGradeRecordsBody,
  SendAccessCodesBody,
  ImportEmailsBody,
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
      publicViewEnabled: body.publicViewEnabled ?? false,
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
      publicViewEnabled: body.publicViewEnabled,
      sheetImportUrl: body.sheetImportUrl,
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

const studentKey = (studentNumber: string) => studentNumber.trim().toLowerCase();

/** The access code a student already has in other subjects (student number -> code), so a new record can reuse it. */
async function existingStudentCodes(studentNumbers: string[], exceptSubjectId?: string): Promise<Map<string, string>> {
  const numbers = [...new Set(studentNumbers.map((n) => n.trim()).filter(Boolean))];
  const found = new Map<string, string>();
  if (numbers.length === 0) return found;
  const rows = await prisma.gradeRecord.findMany({
    where: { studentNumber: { in: numbers, mode: "insensitive" }, ...(exceptSubjectId ? { subjectId: { not: exceptSubjectId } } : {}), subject: { isDeleted: false } },
    select: { studentNumber: true, code: true },
    orderBy: { createdAt: "asc" },
  });
  for (const row of rows) if (!found.has(studentKey(row.studentNumber))) found.set(studentKey(row.studentNumber), row.code);
  return found;
}

export async function createRecord(subjectId: string, caller: Caller, body: CreateGradeRecordBody) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertWriteAccess(access);
  const code = body.code?.trim() ? body.code.trim() : (await existingStudentCodes([body.studentNumber])).get(studentKey(body.studentNumber)) ?? newGradeRecordAccessCode();
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
 * Matches "sync from source sheet" — re-import does not append.
 *
 * A student who was already in the subject keeps their access code (matched by student number) unless the sheet names a
 * code, so the links and codes already sent to students keep working after a re-import. Only new students get a new code.
 */
export async function importRecords(subjectId: string, caller: Caller, body: ImportGradeRecordsBody) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertWriteAccess(access);

  return prisma.$transaction(async (tx) => {
    const before = await tx.gradeRecord.findMany({ where: { subjectId }, select: { studentNumber: true, code: true, email: true, emailSentAt: true } });
    const previous = new Map(before.map((row) => [studentKey(row.studentNumber), row]));
    // a student already in another subject keeps that one code here too, so one email opens everything
    const elsewhere = await existingStudentCodes(body.records.map((r) => r.studentNumber), subjectId);
    const removed = await tx.gradeRecord.deleteMany({ where: { subjectId } });
    if (body.records.length > 0) {
      const used = new Set<string>();
      const data = body.records.map((record) => {
        const earlier = previous.get(studentKey(record.studentNumber));
        const given = record.code?.trim() || "";
        let code = given || earlier?.code || elsewhere.get(studentKey(record.studentNumber)) || newGradeRecordAccessCode();
        // two rows with the same student number in this subject must not share a code
        if (used.has(`${studentKey(record.studentNumber)}|${code}`)) code = newGradeRecordAccessCode();
        used.add(`${studentKey(record.studentNumber)}|${code}`);
        const kept = !given && earlier?.code === code;
        return {
          subjectId,
          studentName: record.studentName,
          studentNumber: record.studentNumber,
          email: record.email ?? earlier?.email ?? null,
          code,
          // "sent" only stays true while the code that was sent is still the code
          emailSentAt: kept ? earlier?.emailSentAt ?? null : null,
          grades: record.grades,
          maxScores: record.maxScores ?? undefined,
        };
      });
      await tx.gradeRecord.createMany({ data });
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
  // Remember the link that worked, with the subject, so it is there next time whatever browser is used.
  await prisma.gradeSubject.update({ where: { id: subjectId }, data: { sheetImportUrl: sheetUrl } });
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
  // the student's code is the same in every subject, so it changes in all of them
  const code = newGradeRecordAccessCode();
  await prisma.gradeRecord.updateMany({
    where: { studentNumber: { equals: existing.studentNumber, mode: "insensitive" }, id: { not: recordId } },
    data: { code, emailSentAt: null },
  });
  return prisma.gradeRecord.update({
    where: { id: recordId },
    data: { code, emailSentAt: null },
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
  if (record.studentNumber !== body.studentNumber) throw notFound(PUBLIC_COMPUTE_NOT_AVAILABLE);
  const proof = await prisma.gradeRecord.findFirst({ where: { studentNumber: body.studentNumber, code: body.code, subject: { isDeleted: false } }, select: { id: true } });
  if (!proof) throw notFound(PUBLIC_COMPUTE_NOT_AVAILABLE);
  if (!record.subject.studentComputeEnabled || !record.subject.publicViewEnabled) {
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
  // one matching record (student number + code) proves who is asking; then every subject of that student that is
  // visible on the public page is returned, so a single email is enough.
  const proof = await prisma.gradeRecord.findFirst({ where: { studentNumber, code, subject: { isDeleted: false } }, select: { id: true } });
  if (!proof) return [];
  const records = await prisma.gradeRecord.findMany({
    where: { studentNumber, subject: { isDeleted: false, publicViewEnabled: true } },
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

// ---------------------------------------------------------------- access emails
// Sent as a background job, one email at a time with a pause between them, so a long list neither holds a request open nor
// hits the mail server as a burst (which is how a mailbox gets flagged as spam or blocked). Failures are kept per student.
// The job lives in Redis (not in this process): a restart or a second backend replica does not lose it, and a job that was
// running when the backend stopped is resumed on start (`resumeAccessEmailJobs`).

const EMAIL_PAUSE_MS = 1500; // between two emails (only when a real SMTP server is configured)
const EMAIL_DAILY_LIMIT = 400; // emails started in 24 hours across the app; most mailboxes allow 500
const EMAIL_STOP_AFTER_FAILURES = 3; // this many failures in a row means the server refuses us: stop instead of retrying
const JOB_KEY = (subjectId: string) => `gradeEmailJob:${subjectId}`;
const LOCK_KEY = (subjectId: string) => `gradeEmailLock:${subjectId}`;
const JOB_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOCK_SECONDS = 30; // renewed after every email; a dead runner's lock lapses and the job is resumed
const heldLocks = new Set<string>(); // subjects this process is sending for (released on a normal shutdown)
const RUNNER_ID = randomUUID();

type EmailFailure = { studentNumber: string; studentName: string; reason: string };
type EmailJob = {
  state: "running" | "done";
  total: number;
  sent: number;
  failed: EmailFailure[];
  /** Left out because they have no (valid) email address. */
  noEmail: number;
  /** Left out because they were already sent their code (and "resend" was off). */
  alreadySent: number;
  /** Why the job ended before reaching everyone, if it did. */
  stoppedReason: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** Records still to send, in order (this is what lets a restarted backend carry on). */
  pendingIds: string[];
  resend: boolean;
  subjectName: string;
};

async function loadJob(subjectId: string): Promise<EmailJob | null> {
  const raw = await redis.get(JOB_KEY(subjectId));
  return raw ? (JSON.parse(raw) as EmailJob) : null;
}
const saveJob = (subjectId: string, job: EmailJob) => redis.setex(JOB_KEY(subjectId), JOB_TTL_SECONDS, JSON.stringify(job));
const takeLock = async (subjectId: string) => (await redis.set(LOCK_KEY(subjectId), RUNNER_ID, "EX", LOCK_SECONDS, "NX")) === "OK";
const renewLock = (subjectId: string) => redis.set(LOCK_KEY(subjectId), RUNNER_ID, "EX", LOCK_SECONDS);

const EMAIL_PATTERN = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The job as the page shows it (without the internal queue). */
function publicJob(job: EmailJob, paused: boolean) {
  const { pendingIds: _pending, resend: _resend, subjectName: _name, ...rest } = job;
  return { ...rest, paused };
}

export async function accessEmailStatus(subjectId: string, caller: Caller) {
  await loadSubjectAccess(subjectId, caller);
  const job = await loadJob(subjectId);
  if (!job) return null;
  // running but nobody holds the lock: the backend that was sending stopped; it is picked up again shortly
  const paused = job.state === "running" && !(await redis.get(LOCK_KEY(subjectId)));
  return publicJob(job, paused);
}

/** Sends the queue of a stored job. Whoever holds the lock runs it; the state is saved after every email. */
async function runEmailJob(subjectId: string): Promise<void> {
  const job = await loadJob(subjectId);
  if (!job || job.state !== "running") return;
  const real = isSmtpConfigured();
  const base = env.FRONTEND_ORIGIN.replace(/\/$/, "");
  let failuresInARow = 0;
  heldLocks.add(subjectId);
  try {
    await runUnscoped(async () => {
      while (job.pendingIds.length > 0) {
        const id = job.pendingIds[0];
        const record = await prisma.gradeRecord.findUnique({ where: { id } });
        job.pendingIds.shift();
        const stillToSend = record && record.email && isValidEmail(record.email) && (job.resend || !record.emailSentAt);
        if (stillToSend) {
          try {
            await sendGradeAccessEmail({
              toEmail: record.email!,
              subjectName: job.subjectName,
              studentName: record.studentName,
              studentNumber: record.studentNumber,
              accessCode: record.code,
              lookupUrl: `${base}/grades?studentNumber=${encodeURIComponent(record.studentNumber)}&code=${encodeURIComponent(record.code)}`,
            });
            // the same code is in every subject of this student: all of them count as sent
            await prisma.gradeRecord.updateMany({ where: { studentNumber: record.studentNumber, code: record.code }, data: { emailSentAt: new Date() } });
            job.sent += 1;
            failuresInARow = 0;
          } catch (err) {
            job.failed.push({
              studentNumber: record.studentNumber,
              studentName: record.studentName,
              reason: (err instanceof Error ? err.message : String(err)).slice(0, 200),
            });
            failuresInARow += 1;
            if (failuresInARow >= EMAIL_STOP_AFTER_FAILURES) {
              job.stoppedReason = `Stopped after ${EMAIL_STOP_AFTER_FAILURES} failures in a row (the mail server may be refusing messages). The remaining ${job.pendingIds.length} were not tried.`;
              job.pendingIds = [];
            }
          }
        }
        await saveJob(subjectId, job);
        await renewLock(subjectId);
        if (real && stillToSend && job.pendingIds.length > 0) await pause(EMAIL_PAUSE_MS);
      }
    });
  } catch (err) {
    job.stoppedReason = `Sending stopped: ${err instanceof Error ? err.message : String(err)}`;
    job.pendingIds = [];
  }
  job.state = "done";
  job.finishedAt = new Date().toISOString();
  await saveJob(subjectId, job);
  await redis.del(LOCK_KEY(subjectId));
  heldLocks.delete(subjectId);
}

/** On a normal shutdown give the locks back at once, so another backend (or this one after a restart) carries on without waiting. */
export async function releaseAccessEmailLocks(): Promise<void> {
  await Promise.all([...heldLocks].map((id) => redis.del(LOCK_KEY(id)).catch(() => undefined)));
  heldLocks.clear();
}

/** Called once when the backend starts: carries on with any job that was running when a backend stopped. */
export async function resumeAccessEmailJobs(): Promise<void> {
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", "gradeEmailJob:*", "COUNT", 100);
      cursor = next;
      for (const key of keys) {
        const subjectId = key.slice("gradeEmailJob:".length);
        const job = await loadJob(subjectId);
        if (job?.state === "running" && (await takeLock(subjectId))) {
          console.log(`[Grade access] resuming email job for subject ${subjectId} (${job.pendingIds.length} left)`);
          void runEmailJob(subjectId);
        }
      }
    } while (cursor !== "0");
  } catch (err) {
    console.error("[Grade access] could not resume email jobs", err);
  }
}

export async function sendAccessCodes(subjectId: string, caller: Caller, body: SendAccessCodesBody) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertWriteAccess(access);
  if (!(await takeLock(subjectId))) throw conflict("Emails for this subject are already being sent. Wait for them to finish.");

  try {
    const where = body.recordIds?.length ? { subjectId, id: { in: body.recordIds } } : { subjectId };
    const records = await prisma.gradeRecord.findMany({ where, orderBy: { studentName: "asc" } });
    // one email per student is enough: someone already emailed from another subject is not emailed again (unless "resend")
    const emailedElsewhere = new Set(
      (
        await prisma.gradeRecord.findMany({
          where: { subjectId: { not: subjectId }, emailSentAt: { not: null }, studentNumber: { in: records.map((r) => r.studentNumber) } },
          select: { studentNumber: true, code: true },
        })
      ).map((r) => `${studentKey(r.studentNumber)}|${r.code}`)
    );
    const wasSent = (r: (typeof records)[number]) => Boolean(r.emailSentAt) || emailedElsewhere.has(`${studentKey(r.studentNumber)}|${r.code}`);
    const queue = records.filter((r) => r.email && isValidEmail(r.email) && (body.resend || !wasSent(r)));
    const noEmail = records.filter((r) => !r.email || !isValidEmail(r.email)).length;
    const alreadySent = records.filter((r) => r.email && isValidEmail(r.email) && !body.resend && wasSent(r)).length;

    let allowance = queue.length;
    if (isSmtpConfigured()) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const usedToday = await runUnscoped(() => prisma.gradeRecord.count({ where: { emailSentAt: { gte: since } } }));
      allowance = Math.max(0, EMAIL_DAILY_LIMIT - usedToday);
    }
    const toSend = queue.slice(0, allowance);
    const job: EmailJob = {
      state: toSend.length > 0 ? "running" : "done",
      total: toSend.length,
      sent: 0,
      failed: [],
      noEmail,
      alreadySent,
      stoppedReason:
        toSend.length < queue.length
          ? `Daily limit reached: only ${toSend.length} of ${queue.length} emails were queued so the mail account is not flagged. Send the rest tomorrow.`
          : null,
      startedAt: new Date().toISOString(),
      finishedAt: toSend.length > 0 ? null : new Date().toISOString(),
      pendingIds: toSend.map((r) => r.id),
      resend: Boolean(body.resend),
      subjectName: access.subject.name,
    };
    await saveJob(subjectId, job);
    if (toSend.length === 0) {
      await redis.del(LOCK_KEY(subjectId));
      return publicJob(job, false);
    }
    void runEmailJob(subjectId);
    return publicJob(job, false);
  } catch (err) {
    await redis.del(LOCK_KEY(subjectId));
    throw err;
  }
}

/**
 * Fills in the email of records that already exist, from a table copied out of a sheet (name, student number, email).
 * Matched by student number; only the email changes (grades and access codes are never touched, no record is created).
 * A changed address clears "sent" so the new address gets the code.
 */
export async function importEmails(subjectId: string, caller: Caller, body: ImportEmailsBody) {
  const access = await loadSubjectAccess(subjectId, caller);
  assertWriteAccess(access);
  const records = await prisma.gradeRecord.findMany({ where: { subjectId } });
  const bySubjectNumber = new Map(records.map((r) => [r.studentNumber.trim().toLowerCase(), r]));
  const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

  let updated = 0;
  let unchanged = 0;
  const unmatched: { studentNumber: string; studentName: string }[] = [];
  const invalid: { studentNumber: string; email: string }[] = [];
  const nameDiffers: { studentNumber: string; sheetName: string; recordName: string }[] = [];
  const seen = new Set<string>();
  for (const row of body.rows) {
    const number = row.studentNumber.trim();
    const email = row.email.trim().toLowerCase();
    const record = bySubjectNumber.get(number.toLowerCase());
    if (!record) {
      unmatched.push({ studentNumber: number, studentName: row.studentName ?? "" });
      continue;
    }
    if (!isValidEmail(email)) {
      invalid.push({ studentNumber: number, email: row.email.trim() });
      continue;
    }
    if (seen.has(record.id)) continue; // a student listed twice: the first row wins
    seen.add(record.id);
    if (row.studentName && squash(row.studentName) !== squash(record.studentName)) {
      // names are written in many ways ("Last, First" or "First Last"): only flag when the words differ too
      const words = (v: string) => v.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
      if (words(row.studentName) !== words(record.studentName)) {
        nameDiffers.push({ studentNumber: number, sheetName: row.studentName, recordName: record.studentName });
      }
    }
    if ((record.email ?? "").toLowerCase() === email) {
      unchanged += 1;
      continue;
    }
    await prisma.gradeRecord.update({ where: { id: record.id }, data: { email, emailSentAt: null } });
    updated += 1;
  }
  return { updated, unchanged, unmatched, invalid, nameDiffers };
}

