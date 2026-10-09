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

const HEADER_ALIASES: Record<"studentName" | "studentNumber" | "email" | "code", string[]> = {
  studentName: ["studentname", "student_name", "name", "student"],
  studentNumber: ["studentnumber", "student_number", "student no", "studentno", "id number"],
  email: ["email", "email_address", "student_email"],
  code: ["code", "accesscode", "access_code", "securitycode", "security_code"],
};

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
  const normalized = header.map((h) => h.toLowerCase());
  const aliases = HEADER_ALIASES[key];
  return normalized.findIndex((h) => aliases.includes(h.replace(/\s+/g, "")));
}

/** True when the cell should be treated as “no score” (not imported, not coerced to 0). */
function isBlankScoreCell(raw: string): boolean {
  const t = raw.trim();
  if (t === "") return true;
  if (t === "-" || t === "—") return true;
  return /^n\/?a$/i.test(t);
}

/** Parse a header row plus data rows (e.g. from CSV or first Excel sheet). */
export function parseGradeRecordsFromTable(header: string[], dataRows: string[][]): { records: GradeImportRecord[]; errors: string[] } {
  const errors: string[] = [];
  if (header.length === 0 || dataRows.length === 0) {
    return { records: [], errors: ["Table must include a header row and at least one data row."] };
  }

  const studentNameIdx = resolveColumnIndex(header, "studentName");
  const studentNumberIdx = resolveColumnIndex(header, "studentNumber");
  const emailIdx = resolveColumnIndex(header, "email");
  const codeIdx = resolveColumnIndex(header, "code");

  if (studentNameIdx < 0) errors.push("Missing required studentName column.");
  if (studentNumberIdx < 0) errors.push("Missing required studentNumber column.");
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
        "Import requires a max-score row directly under the header (row 2), then student rows starting at row 3.",
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
        "Row 2 (under the header) must list a positive number under each grade column you want to import (those numbers are the maximum scores). No usable grade columns were found.",
      ],
    };
  }

  const activeIndexSet = new Set(activeScoreColumns.map((c) => c.index));
  for (const col of candidateScoreColumns) {
    if (activeIndexSet.has(col.index)) continue;
    const rawMax = getMaxCell(col.index).trim();
    errors.push(
      `Skipped column "${col.displayName}": row 2 must be a positive max score for this component (found ${rawMax ? `"${rawMax}"` : "empty"}). Example: put 100 under "Final Exam" if the exam is out of 100 — this is separate from any "Final grade" / computed total column (those should stay blank in row 2 or be omitted).`
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
          `Row ${rowIndex + 3}: grade "${col.displayName}" must be a number, blank, "-", or "N/A" (blank is not stored as 0).`
        );
        return;
      }
      grades[col.displayName] = numeric;
    }

    const codeFromFile = codeIdx >= 0 ? get(codeIdx).trim() : "";
    const codeValue: string | null = codeFromFile.length > 0 ? codeFromFile : null;
    if (!studentNameRaw || !studentNumberRaw) {
      errors.push(`Row ${rowIndex + 3}: studentName and studentNumber are required.`);
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
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 3) {
    return {
      records: [],
      errors: [
        "CSV must include a header row, a max-score row (row 2), and at least one student row (row 3+).",
      ],
    };
  }
  const header = parseCsvLine(lines[0]);
  const dataRows = lines.slice(1).map((line) => parseCsvLine(line));
  return parseGradeRecordsFromTable(header, dataRows);
}
