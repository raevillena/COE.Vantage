/** Parse CSV lines and build grade import rows (used by CSV file upload, Google Sheets CSV export, and Excel first sheet). */

export type GradeImportRecord = {
  studentName: string;
  studentNumber: string;
  email: string | null;
  /** From file when present; `null` means the server assigns an access code on import. */
  code: string | null;
  grades: Record<string, number>;
  maxScores: Record<string, number>;
};

export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current.trim());
  return values;
}

/** Lowercase letters and digits only, so "Student Number ", "Student No." and "student_number" compare equal. */
function normalizeHeader(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Accepted header names for each identity column, already normalised (see normalizeHeader). */
const HEADER_ALIASES: Record<"studentName" | "studentNumber" | "email" | "code", string[]> = {
  studentName: ["studentname", "name", "student", "fullname", "studentsname", "nameofstudent", "names"],
  studentNumber: ["studentnumber", "studentno", "studentnum", "studentid", "idnumber", "idno"],
  email: ["email", "emailaddress", "studentemail"],
  code: ["code", "accesscode", "securitycode"],
};

/** How far down to look for the header row (class records often start with a title and a schedule line). */
const HEADER_SEARCH_ROWS = 20;

/**
 * Column headers (normalized) that are **not** raw grade components:
 * course codes, remarks, **computed final / summary grades** (distinct from e.g. **Final Exam** scores).
 *
 * Normalization: lowercase, strip non-alphanumeric, so `Final Grade`, `Final Grade (100)`, and
 * `final_grade` all match `finalgrade`. **Not** matched: `Final Exam` → `finalexam`.
 */
const IMPORT_IGNORE_METADATA_ALIASES = new Set([
  "course",
  "coursecode",
  "remarks",
  "remark",
  "remarkstext",
  "comments",
  "comment",
  "notes",
  "note",
  // Computed / summary columns — do not import as `grades` (use subject compute for true final).
  "finalgrade",
  "finalgrades",
  "final",
  "coursegrade",
  "totalgrade",
  "overallgrade",
  "semestralgrade",
  "gwa",
  "weightedgrade",
  "transmutedgrade",
  "overallrating",
]);

/** Lowercase + alphanumeric only — for metadata ignore matching (see IMPORT_IGNORE_METADATA_ALIASES). */
function normHeaderForMetadataMatch(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Lowercase header cell, collapse spaces to `_` for stable keys (matches legacy `*_max` pairing). */
function headerNormKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

function resolveColumnIndex(header: string[], key: keyof typeof HEADER_ALIASES): number {
  const aliases = HEADER_ALIASES[key];
  return header.findIndex((h) => aliases.includes(normalizeHeader(h)));
}

/** The first of the top rows that has both a name column and a student-number column; 0 when none does. */
function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i += 1) {
    if (resolveColumnIndex(rows[i], "studentName") >= 0 && resolveColumnIndex(rows[i], "studentNumber") >= 0) return i;
  }
  return 0;
}

/**
 * Parse a whole sheet: the header row is found among the first rows (a title or schedule above it is fine), the
 * row under it holds each column's maximum score, and student rows follow.
 */
export function parseGradeRecordsFromRows(rows: string[][]): { records: GradeImportRecord[]; errors: string[] } {
  const headerIndex = findHeaderRowIndex(rows);
  let maxRowIndex = headerIndex + 1;
  while (maxRowIndex < rows.length && rows[maxRowIndex].every((cell) => cell.trim() === "")) maxRowIndex += 1;
  // `maxRowIndex + 1` is the 1-based sheet row of the max-score row, which row numbers in messages count from.
  return parseGradeRecordsFromTable(rows[headerIndex] ?? [], rows.slice(maxRowIndex), maxRowIndex + 1);
}

/** True when the cell should be treated as “no score” (not imported, not coerced to 0). */
function isBlankScoreCell(raw: string): boolean {
  const t = raw.trim();
  if (t === "") return true;
  if (t === "-" || t === "—") return true;
  return /^n\/?a$/i.test(t);
}

/**
 * Parse a header row plus the rows under it: the first is the max-score row, the rest are students.
 * `maxRowNumber` is that max-score row's 1-based number in the source (2 when the header is on row 1).
 */
export function parseGradeRecordsFromTable(
  header: string[],
  dataRows: string[][],
  maxRowNumber = 2
): { records: GradeImportRecord[]; errors: string[] } {
  const errors: string[] = [];
  if (header.length === 0 || dataRows.length === 0) {
    return { records: [], errors: ["Table must include a header row and at least one data row."] };
  }

  const studentNameIdx = resolveColumnIndex(header, "studentName");
  const studentNumberIdx = resolveColumnIndex(header, "studentNumber");
  const emailIdx = resolveColumnIndex(header, "email");
  const codeIdx = resolveColumnIndex(header, "code");

  if (studentNameIdx < 0) errors.push(`Could not find the name column: a header named "Name" or "Student Name" (looked in the first ${HEADER_SEARCH_ROWS} rows).`);
  if (studentNumberIdx < 0) errors.push(`Could not find the student number column: a header named "Student Number" or "Student No." (looked in the first ${HEADER_SEARCH_ROWS} rows).`);
  if (errors.length > 0) return { records: [], errors };

  const reserved = new Set<number>();
  reserved.add(studentNameIdx);
  reserved.add(studentNumberIdx);
  if (codeIdx >= 0) reserved.add(codeIdx);
  if (emailIdx >= 0) reserved.add(emailIdx);

  for (let i = 0; i < header.length; i += 1) {
    const norm = normHeaderForMetadataMatch(header[i]);
    if (IMPORT_IGNORE_METADATA_ALIASES.has(norm)) reserved.add(i);
  }

  // Separate columns like `Quiz 1_max` / `max_Quiz 1` — not score entry columns (max comes from row 2).
  const indicesThatAreMaxOnlyColumns = new Set<number>();
  for (let i = 0; i < header.length; i += 1) {
    if (reserved.has(i)) continue;
    const hn = headerNormKey(header[i]);
    if (/^(.+)_max$/.test(hn) || /^max_(.+)$/.test(hn)) indicesThatAreMaxOnlyColumns.add(i);
  }

  /** Every non-reserved header cell that could be a component column (before row-2 filter). */
  const candidateScoreColumns: { displayName: string; index: number; normKey: string }[] = [];
  for (let i = 0; i < header.length; i += 1) {
    if (reserved.has(i) || indicesThatAreMaxOnlyColumns.has(i)) continue;
    const displayName = header[i].trim();
    if (displayName === "") continue; // e.g. the row-number column: no header means no component
    candidateScoreColumns.push({ displayName, index: i, normKey: headerNormKey(displayName) });
  }

  if (candidateScoreColumns.length === 0) {
    return { records: [], errors: ["Table must include at least one grade component column (besides identity/email/code)."] };
  }

  // Row 2 (first data row) = maximum scores per component. Only columns with a positive numeric max are imported.
  if (dataRows.length < 2) {
    return {
      records: [],
      errors: [
        "Import requires a max-score row directly under the header, then the student rows.",
      ],
    };
  }

  const maxRow = dataRows[0];
  const getMaxCell = (idx: number) => maxRow[idx] ?? "";

  const activeScoreColumns: { displayName: string; index: number; normKey: string }[] = [];
  const defaultMaxByDisplayName = new Map<string, number>();

  for (const col of candidateScoreColumns) {
    const rawMax = getMaxCell(col.index).trim();
    const maxNum = Number(rawMax);
    if (Number.isFinite(maxNum) && maxNum > 0) {
      activeScoreColumns.push(col);
      defaultMaxByDisplayName.set(col.displayName, maxNum);
    }
  }

  if (activeScoreColumns.length === 0) {
    return {
      records: [],
      errors: [
        "The max-score row (directly under the header) must list a positive number under each grade column you want to import. No usable grade columns were found.",
      ],
    };
  }

  const activeIndexSet = new Set(activeScoreColumns.map((c) => c.index));
  for (const col of candidateScoreColumns) {
    if (activeIndexSet.has(col.index)) continue;
    const rawMax = getMaxCell(col.index).trim();
    // A column headed only by a weight ("50%") with no max is a label, not a component: nothing to warn about.
    if (rawMax === "" && /^\d+(\.\d+)?\s*%$/.test(col.displayName)) continue;
    errors.push(
      `Skipped column "${col.displayName}": the max-score row (directly under the header) must have a positive max for this component (found ${rawMax ? `"${rawMax}"` : "empty"}). Example: put 100 under "Final Exam" if the exam is out of 100 — this is separate from any "Final grade" / computed total column (those should stay blank there or be omitted).`
    );
  }

  const studentDataRows = dataRows.slice(1);
  if (studentDataRows.length === 0) {
    return { records: [], errors: ["At least one student row is required after the max-score row."] };
  }

  const records: GradeImportRecord[] = [];
  studentDataRows.forEach((values, rowIndex) => {
    const get = (idx: number) => values[idx] ?? "";
    const studentNameRaw = get(studentNameIdx).trim();
    const studentNumberRaw = get(studentNumberIdx).trim();

    if (!studentNameRaw && !studentNumberRaw) {
      return;
    }

    const grades: Record<string, number> = {};
    const maxScores: Record<string, number> = {};

    for (const col of activeScoreColumns) {
      const defaultMax = defaultMaxByDisplayName.get(col.displayName) ?? 100;
      maxScores[col.displayName] = defaultMax;

      const raw = get(col.index);
      if (isBlankScoreCell(raw)) {
        continue;
      }
      const numeric = Number(raw.trim());
      if (!Number.isFinite(numeric)) {
        errors.push(
          `Row ${maxRowNumber + 1 + rowIndex}: grade "${col.displayName}" must be a number, blank, "-", or "N/A" (blank is not stored as 0).`
        );
        return;
      }
      grades[col.displayName] = numeric;
    }

    const codeFromFile = codeIdx >= 0 ? get(codeIdx).trim() : "";
    const codeValue: string | null = codeFromFile.length > 0 ? codeFromFile : null;
    if (!studentNameRaw || !studentNumberRaw) {
      errors.push(`Row ${maxRowNumber + 1 + rowIndex}: studentName and studentNumber are required.`);
      return;
    }

    records.push({
      studentName: studentNameRaw,
      studentNumber: studentNumberRaw,
      email: emailIdx >= 0 ? get(emailIdx) || null : null,
      code: codeValue,
      grades,
      maxScores,
    });
  });

  return { records, errors };
}

/** Parse full CSV text into import records plus per-row error messages for skipped rows. */
export function parseGradeRecordsFromCsvText(text: string): { records: GradeImportRecord[]; errors: string[] } {
  // Blank lines are kept (they are skipped later) so the row numbers in messages match the sheet's.
  const rows = text.split(/\r?\n/).map((line) => parseCsvLine(line.trim()));
  if (rows.filter((row) => row.some((cell) => cell !== "")).length < 3) {
    return {
      records: [],
      errors: [
        "CSV must include a header row, a max-score row (the row under it), and at least one student row.",
      ],
    };
  }
  return parseGradeRecordsFromRows(rows);
}
