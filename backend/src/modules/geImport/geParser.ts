import ExcelJS from "exceljs";
import { badRequest } from "../../utils/errors.js";

/**
 * Reads a GE course offering sheet (the registrar layout): Program, Year, Section, Course Code, Course Title,
 * No. of Units (Lec, Lab), Course Title, No. of Units, Time, Day, Bldg & Room, Faculty.
 * Works on CSV, tab separated text (pasted from a spreadsheet) and .xlsx.
 */

export interface GeRow {
  /** 1-based position of the row in the source, for messages. */
  rowIndex: number;
  program: string;
  year: number | null;
  section: string;
  code: string;
  /** Upper case code without spaces or punctuation, used to match subjects ("PHY 10 " -> "PHY10"). */
  codeKey: string;
  title: string;
  lecUnits: number | null;
  labUnits: number | null;
  units: number | null;
  timeRaw: string;
  dayRaw: string;
  room: string;
  faculty: string;
  /** 1 = Mon .. 6 = Sat. */
  days: number[];
  startTime: string | null;
  endTime: string | null;
  /** True when the time had no AM or PM and was read as 7 AM to 6 PM. */
  timeInferred: boolean;
  /** Rows of the college's own faculty (labs of its own subjects), not GE offerings. */
  coeFaculty: boolean;
  /** Reasons the row cannot be scheduled as is (no time, no days, no code). */
  problems: string[];
}

export interface GeParseResult {
  rows: GeRow[];
  groups: { key: string; program: string; year: number | null; section: string; count: number }[];
  warnings: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9&]/g, "");

export function codeKey(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Splits delimited text honouring quotes (a quoted cell may contain the delimiter or a line break). */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function parseTextTable(text: string): string[][] {
  const sample = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 10).join("\n");
  const delimiter = (sample.match(/\t/g)?.length ?? 0) >= (sample.match(/,/g)?.length ?? 0) && sample.includes("\t") ? "\t" : ",";
  return parseDelimited(text, delimiter);
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("result" in v && v.result != null) return String(v.result);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if (v instanceof Date) return v.toISOString();
    return "";
  }
  return String(v);
}

export async function parseWorkbookTable(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw badRequest("The file could not be read as an Excel workbook. Save it as .xlsx or CSV.");
  }
  const sheet = wb.worksheets[0];
  if (!sheet) throw badRequest("The workbook has no sheets");
  const table: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c += 1) cells.push(cellText(row.getCell(c).value));
    table.push(cells);
  });
  return table;
}

const DAY_TOKEN = /TH|SA|SU|M|T|W|F|S/gi;
const DAY_NUMBER: Record<string, number> = { M: 1, T: 2, W: 3, TH: 4, F: 5, SA: 6, S: 6 };

/** "MWF" -> [1,3,5], "TTh" -> [2,4]. Sunday is not schedulable and is reported. */
export function parseDays(raw: string): { days: number[]; problems: string[] } {
  const text = raw.replace(/[^A-Za-z]/g, "");
  const days: number[] = [];
  const problems: string[] = [];
  let consumed = 0;
  for (const m of text.matchAll(DAY_TOKEN)) {
    const token = m[0].toUpperCase();
    consumed += token.length;
    if (token === "SU") {
      problems.push("Sunday is not supported");
      continue;
    }
    const d = DAY_NUMBER[token];
    if (d && !days.includes(d)) days.push(d);
  }
  if (consumed !== text.length) problems.push(`Day "${raw.trim()}" was not understood`);
  if (days.length === 0 && problems.length === 0) problems.push("No day");
  return { days, problems };
}

function to24(hour: number, meridiem: string | undefined): number {
  const m = meridiem?.toLowerCase().replace(/\./g, "");
  if (m === "am") return hour === 12 ? 0 : hour;
  if (m === "pm") return hour === 12 ? 12 : hour + 12;
  // No AM or PM on the sheet: 7 to 11 are morning, 12 is noon, 1 to 6 are afternoon.
  if (hour >= 1 && hour <= 6) return hour + 12;
  return hour;
}

const TIME_RANGE = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*$/i;

/** "01:00-02:30" -> 13:00 to 14:30. Returns null when the text is not a time range. */
export function parseTimeRange(raw: string): { start: string; end: string; inferred: boolean } | null {
  const m = TIME_RANGE.exec(raw);
  if (!m) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const sh = to24(Number(m[1]), m[3]);
  const eh = to24(Number(m[4]), m[6]);
  const sm = Number(m[2] ?? 0);
  const em = Number(m[5] ?? 0);
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
  return { start: `${pad(sh)}:${pad(sm)}`, end: `${pad(eh)}:${pad(em)}`, inferred: !m[3] && !m[6] };
}

const num = (s: string): number | null => {
  const n = Number(s.trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

export function normalizeGeTable(table: string[][]): GeParseResult {
  const warnings: string[] = [];
  const headerAt = table.findIndex((r) => r.some((c) => norm(c) === "coursecode"));
  if (headerAt < 0) throw badRequest('No header row with "Course Code" was found. Include the header row when copying.');
  const header = table[headerAt].map(norm);
  const idx = (name: string) => header.indexOf(name);
  const col = {
    program: idx("program"),
    year: idx("year"),
    section: idx("section"),
    code: idx("coursecode"),
    time: idx("time"),
    day: idx("day"),
    room: header.findIndex((h) => h.startsWith("bldg") || h.includes("room")),
    faculty: idx("faculty"),
  };
  const titles = header.map((h, i) => (h === "coursetitle" ? i : -1)).filter((i) => i >= 0);
  const unitCols = header.map((h, i) => (h.startsWith("noofunits") ? i : -1)).filter((i) => i >= 0);
  for (const [name, i] of Object.entries({ program: col.program, year: col.year, section: col.section, code: col.code, time: col.time, day: col.day })) {
    if (i < 0) throw badRequest(`The "${name}" column is missing from the header row`);
  }
  const titleCol = titles[titles.length - 1] ?? titles[0] ?? -1; // the offered title, else the catalog title
  const lecCol = unitCols[0] ?? -1;
  const offeredUnitsCol = unitCols[1] ?? -1;

  const rows: GeRow[] = [];
  let program = "";
  let year: number | null = null;
  let section = "";
  for (let r = headerAt + 1; r < table.length; r += 1) {
    const cells = table[r];
    const get = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
    if (cells.every((c) => c.trim() === "")) continue;
    if (norm(get(lecCol)) === "lec") continue; // the "Lec / Lab" sub-header
    const code = get(col.code);
    const title = (titleCol >= 0 ? get(titleCol) : "") || (titles[0] >= 0 ? get(titles[0]) : "");
    if (get(col.program)) program = get(col.program);
    if (get(col.year)) year = num(get(col.year));
    if (get(col.section)) section = get(col.section);
    if (!code && !title) continue;

    const lec = lecCol >= 0 ? num(get(lecCol)) : null;
    const lab = lecCol >= 0 ? num(get(lecCol + 1)) : null;
    const offered = offeredUnitsCol >= 0 ? num(get(offeredUnitsCol)) : null;
    const timeRaw = get(col.time);
    const dayRaw = get(col.day);
    const problems: string[] = [];
    if (!code) problems.push("No course code");
    const time = parseTimeRange(timeRaw);
    if (!time) problems.push(timeRaw ? `Time "${timeRaw}" was not understood` : "No time");
    else if (time.end <= time.start) problems.push(`Time "${timeRaw}" ends before it starts; check AM and PM`);
    const days = parseDays(dayRaw);
    problems.push(...days.problems);
    const faculty = get(col.faculty);

    rows.push({
      rowIndex: r + 1,
      program,
      year,
      section,
      code,
      codeKey: codeKey(code),
      title,
      lecUnits: lec,
      labUnits: lab,
      units: offered ?? (lec != null || lab != null ? (lec ?? 0) + (lab ?? 0) : null),
      timeRaw,
      dayRaw,
      room: get(col.room),
      faculty,
      days: days.days,
      startTime: time && time.end > time.start ? time.start : null,
      endTime: time && time.end > time.start ? time.end : null,
      timeInferred: !!time?.inferred,
      coeFaculty: norm(faculty) === "coefaculty",
      problems,
    });
  }
  if (rows.length === 0) warnings.push("The header was found but no course rows follow it");

  const groups = new Map<string, { key: string; program: string; year: number | null; section: string; count: number }>();
  for (const row of rows) {
    const key = `${row.program}|${row.year ?? ""}|${row.section}`;
    const g = groups.get(key) ?? { key, program: row.program, year: row.year, section: row.section, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  return { rows, groups: [...groups.values()], warnings };
}
