import { idKey, looksLikeStudentNumber } from "./studentNumber";

export interface SourceRow {
  /** Line in the pasted text (1-based), for messages. */
  line: number;
  studentNumber: string;
  key: string;
  name: string;
  rawGrade: string;
}

/** Column indexes of the pasted table; -1 means "not set". */
export interface Mapping {
  id: number;
  name: number;
  grade: number;
}

export interface Detected {
  /** Index of the header row, or -1 when the paste has none. */
  headerRow: number;
  mapping: Mapping;
  columns: number;
}

/** Splits pasted text (Excel / Google Sheets copy is tab separated; CSV text also works). Quoted cells may hold line breaks. */
export function parseDelimited(text: string): string[][] {
  const source = text.replace(/\r\n?/g, "\n");
  const sample = source.split("\n").filter((line) => line.trim() !== "").slice(0, 5).join("\n");
  const count = (char: string) => sample.split(char).length - 1;
  const delimiter = count("\t") > 0 ? "\t" : count(";") > count(",") ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const ID_HEADERS = ["student number", "student no", "student id", "id number", "id no", "studentnumber", "studentid", "id"];
const NAME_HEADERS = ["student name", "full name", "name"];
const GRADE_HEADERS = ["final grade", "finalgrade", "final rating", "total grade", "grade", "rating"];

/** Exact header text first (in priority order), then a contained phrase of five or more characters. */
function findColumn(headers: string[], patterns: string[]): number {
  for (const pattern of patterns) {
    const index = headers.indexOf(pattern);
    if (index >= 0) return index;
  }
  for (const pattern of patterns) {
    if (pattern.length < 5) continue;
    const index = headers.findIndex((header) => header.includes(pattern));
    if (index >= 0) return index;
  }
  return -1;
}

const GRADE_LIKE = /^(?:[1-5](?:[.,]\d{1,2})?|INC|DRP|IP|INCOMPLETE|DROPPED)$/i;

/** Finds the header row and the id / name / grade columns, from header names or (without a header) from what the cells look like. */
export function detectMapping(rows: string[][]): Detected {
  const columns = rows.reduce((max, row) => Math.max(max, row.length), 0);

  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const headers = rows[r].map(normalize);
    const id = findColumn(headers, ID_HEADERS);
    const grade = findColumn(headers, GRADE_HEADERS);
    if (id < 0 || grade < 0 || id === grade) continue;
    let name = findColumn(headers, NAME_HEADERS);
    if (name === id || name === grade) name = -1;
    return { headerRow: r, mapping: { id, name, grade }, columns };
  }

  // No header: look at the cells.
  const share = (test: (cell: string) => boolean) =>
    Array.from({ length: columns }, (_, c) => {
      const cells = rows.map((row) => row[c] ?? "").filter((cell) => cell !== "");
      return cells.length === 0 ? 0 : cells.filter(test).length / cells.length;
    });
  const idShare = share(looksLikeStudentNumber);
  const gradeShare = share((cell) => GRADE_LIKE.test(cell));
  const nameShare = share((cell) => /\p{L}/u.test(cell) && /[\s,]/.test(cell) && !looksLikeStudentNumber(cell) && !GRADE_LIKE.test(cell));

  const pick = (shares: number[], skip: number[] = [], fromRight = false) => {
    let best = -1;
    for (let c = 0; c < shares.length; c++) {
      if (skip.includes(c) || shares[c] < 0.5) continue;
      if (best < 0 || shares[c] > shares[best] || (fromRight && shares[c] === shares[best])) best = c;
    }
    return best;
  };
  const id = pick(idShare);
  const grade = pick(gradeShare, [id], true);
  const name = pick(nameShare, [id, grade]);
  return { headerRow: -1, mapping: { id, name, grade }, columns };
}

export interface Extracted {
  rows: SourceRow[];
  /** Lines under the header that are not students (sub-headers, totals, blank-id rows). */
  ignored: number;
}

/** Reads the student rows with the chosen columns. A row without a student number is not a student. */
export function extractRows(table: string[][], headerRow: number, mapping: Mapping): Extracted {
  const rows: SourceRow[] = [];
  let ignored = 0;
  if (mapping.id < 0 || mapping.grade < 0) return { rows, ignored };
  for (let r = headerRow + 1; r < table.length; r++) {
    const cells = table[r];
    const studentNumber = (cells[mapping.id] ?? "").trim();
    if (!looksLikeStudentNumber(studentNumber)) {
      ignored++;
      continue;
    }
    rows.push({
      line: r + 1,
      studentNumber,
      key: idKey(studentNumber),
      name: mapping.name >= 0 ? (cells[mapping.name] ?? "").trim() : "",
      rawGrade: (cells[mapping.grade] ?? "").trim(),
    });
  }
  return { rows, ignored };
}
