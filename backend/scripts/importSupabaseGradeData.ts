import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";

type OldSubjectRow = {
  id: string;
  name: string;
  teacher_id: string | null;
  created_at: string | null;
  grading_system: string | null;
};

type OldRecordRow = {
  id: string;
  subject_id: string;
  student_name: string;
  student_number: string;
  email: string | null;
  code: string;
  grades: string;
  created_at: string | null;
  updated_at: string | null;
  max_scores: string | null;
  computed_grade: string | null;
  email_sent_at: string | null;
};

const prisma = new PrismaClient();
const TARGET_EMAIL = "faculty1@coe.vantage";

function extractValuesSection(sql: string): string {
  const valuesIdx = sql.indexOf("VALUES");
  if (valuesIdx < 0) throw new Error("Invalid SQL file: missing VALUES");
  let section = sql.slice(valuesIdx + "VALUES".length).trim();
  if (section.endsWith(";")) section = section.slice(0, -1);
  return section;
}

function splitTuples(valuesSection: string): string[] {
  const tuples: string[] = [];
  let inQuote = false;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < valuesSection.length; i += 1) {
    const ch = valuesSection[i];
    const next = valuesSection[i + 1];
    if (ch === "'") {
      if (inQuote && next === "'") {
        i += 1;
        continue;
      }
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (ch === "(") {
      if (depth === 0) start = i + 1;
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        tuples.push(valuesSection.slice(start, i));
        start = -1;
      }
    }
  }
  return tuples;
}

function splitFields(tupleContent: string): string[] {
  const fields: string[] = [];
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < tupleContent.length; i += 1) {
    const ch = tupleContent[i];
    const next = tupleContent[i + 1];
    if (ch === "'") {
      if (inQuote && next === "'") {
        i += 1;
        continue;
      }
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && ch === ",") {
      fields.push(tupleContent.slice(start, i).trim());
      start = i + 1;
    }
  }
  fields.push(tupleContent.slice(start).trim());
  return fields;
}

function parseSqlLiteral(raw: string): string | null {
  if (raw.toUpperCase() === "NULL") return null;
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw;
}

function parseSubjects(sql: string): OldSubjectRow[] {
  const tuples = splitTuples(extractValuesSection(sql));
  return tuples.map((tuple) => {
    const fields = splitFields(tuple).map(parseSqlLiteral);
    if (fields.length !== 5) throw new Error(`Unexpected subject column count: ${fields.length}`);
    return {
      id: fields[0]!,
      name: fields[1]!,
      teacher_id: fields[2],
      created_at: fields[3],
      grading_system: fields[4],
    };
  });
}

function parseRecords(sql: string): OldRecordRow[] {
  const tuples = splitTuples(extractValuesSection(sql));
  return tuples.map((tuple) => {
    const fields = splitFields(tuple).map(parseSqlLiteral);
    if (fields.length !== 12) throw new Error(`Unexpected record column count: ${fields.length}`);
    return {
      id: fields[0]!,
      subject_id: fields[1]!,
      student_name: fields[2]!,
      student_number: fields[3]!,
      email: fields[4],
      code: fields[5]!,
      grades: fields[6]!,
      created_at: fields[7],
      updated_at: fields[8],
      max_scores: fields[9],
      computed_grade: fields[10],
      email_sent_at: fields[11],
    };
  });
}

function asJson(value: string | null): Prisma.InputJsonValue | null {
  if (!value) return null;
  return JSON.parse(value) as Prisma.InputJsonValue;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const root = process.cwd();
  const publicDir = path.join(root, "public");
  const subjectsSql = await readFile(path.join(publicDir, "subjects_rows.sql"), "utf8");
  const recordsSql = await readFile(path.join(publicDir, "records_rows.sql"), "utf8");

  const oldSubjects = parseSubjects(subjectsSql);
  const oldRecords = parseRecords(recordsSql);

  const owner = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, departmentId: true, isDeleted: true },
  });
  if (!owner || owner.isDeleted) {
    throw new Error(`Target faculty user not found or deleted: ${TARGET_EMAIL}`);
  }

  const subjectIdSet = new Set(oldSubjects.map((subject) => subject.id));
  const recordsForKnownSubjects = oldRecords.filter((record) => subjectIdSet.has(record.subject_id));

  if (dryRun) {
    console.log("Dry run only. No writes performed.");
    console.log(`Target owner: ${TARGET_EMAIL} (${owner.id})`);
    console.log(`Subjects parsed: ${oldSubjects.length}`);
    console.log(`Records parsed: ${oldRecords.length}`);
    console.log(`Records with known subjects: ${recordsForKnownSubjects.length}`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const subject of oldSubjects) {
      const gradingSystem = asJson(subject.grading_system);
      const studentComputeEnabled =
        gradingSystem && typeof gradingSystem === "object" && !Array.isArray(gradingSystem)
          ? (gradingSystem as Record<string, unknown>).student_compute_enabled === true
          : false;
      await tx.gradeSubject.upsert({
        where: { id: subject.id },
        update: {
          name: subject.name,
          ownerId: owner.id,
          departmentId: owner.departmentId ?? null,
          gradingSystem: gradingSystem ? gradingSystem : Prisma.JsonNull,
          studentComputeEnabled,
          isDeleted: false,
          deletedAt: null,
        },
        create: {
          id: subject.id,
          name: subject.name,
          ownerId: owner.id,
          departmentId: owner.departmentId ?? null,
          gradingSystem: gradingSystem ? gradingSystem : undefined,
          studentComputeEnabled,
          createdAt: subject.created_at ? new Date(subject.created_at) : undefined,
        },
      });
    }

    for (const record of recordsForKnownSubjects) {
      const grades = asJson(record.grades);
      if (!grades || Array.isArray(grades) || typeof grades !== "object") continue;
      const maxScores = asJson(record.max_scores);
      const computedGrade = asJson(record.computed_grade);

      await tx.gradeRecord.upsert({
        where: { id: record.id },
        update: {
          subjectId: record.subject_id,
          studentName: record.student_name,
          studentNumber: record.student_number,
          email: record.email,
          code: record.code,
          grades,
          maxScores: maxScores ? maxScores : Prisma.JsonNull,
          computedGrade: computedGrade ? computedGrade : Prisma.JsonNull,
          emailSentAt: record.email_sent_at ? new Date(record.email_sent_at) : null,
          updatedAt: record.updated_at ? new Date(record.updated_at) : new Date(),
        },
        create: {
          id: record.id,
          subjectId: record.subject_id,
          studentName: record.student_name,
          studentNumber: record.student_number,
          email: record.email,
          code: record.code,
          grades,
          maxScores: maxScores ?? undefined,
          computedGrade: computedGrade ?? undefined,
          emailSentAt: record.email_sent_at ? new Date(record.email_sent_at) : undefined,
          createdAt: record.created_at ? new Date(record.created_at) : undefined,
          updatedAt: record.updated_at ? new Date(record.updated_at) : undefined,
        },
      });
    }
  });

  console.log(`Imported subjects: ${oldSubjects.length}`);
  console.log(`Imported records: ${recordsForKnownSubjects.length}`);
  console.log(`Mapped owner: ${TARGET_EMAIL}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

