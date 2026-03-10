/**
 * Faculty import from clipboard / CSV: parse pasted lines and format emails.
 * Expected format: first non-empty row is a header from Excel/Sheets export.
 * Names may contain Unicode characters (e.g. ñ/Ñ, accented letters); these are preserved.
 */

export interface ParsedFacultyRow {
  name: string;
  status: string;
  department: string;
  roleText?: string;
  maxUnitsText?: string;
}

function splitLine(line: string): string[] {
  // If this came from direct Excel/Sheets copy, cells are tab-separated.
  if (line.includes("\t")) {
    return line.split("\t").map((c) => c.trim());
  }

  // Otherwise treat as CSV, handling quotes so commas inside quotes are preserved.
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] as string;
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  cells.push(current.trim());
  return cells;
}

function normalizeName(raw: string): string {
  // Trim and strip optional surrounding quotes only; preserve ñ/Ñ and other Unicode (e.g. "Peña, Juan").
  const trimmed = raw.trim().replace(/^"|"$/g, "");
  if (!trimmed) return "";
  if (trimmed.includes(",")) {
    const [lastPart, firstPart] = trimmed.split(",", 2);
    const last = lastPart?.trim() ?? "";
    const firstAndMiddle = firstPart?.trim() ?? "";
    if (!firstAndMiddle) return last;
    return `${firstAndMiddle} ${last}`.replace(/\s+/g, " ");
  }
  return trimmed;
}

/** Column indices derived from the header row (e.g. Department, Name, Role, Max_Units, Status). */
function getHeaderIndices(headerCells: string[]): { department: number; name: number; role: number; maxUnits: number; status: number } {
  const normalized = headerCells.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const department = normalized.findIndex((h) => /department/.test(h));
  const name = normalized.findIndex((h) => /^name$/i.test(h.trim()) || (h === "name"));
  const role = normalized.findIndex((h) => /^role$/i.test(h.trim()) || /role/.test(h));
  const maxUnits = normalized.findIndex((h) => /max_?units?/.test(h) || h === "max_units" || h === "max units");
  const status = normalized.findIndex((h) => /^status$/i.test(h.trim()) || /status/.test(h));

  return {
    department: department >= 0 ? department : 0,
    name: name >= 0 ? name : 1,
    role: role >= 0 ? role : 2,
    maxUnits: maxUnits >= 0 ? maxUnits : 3,
    status: status >= 0 ? status : 4,
  };
}

/**
 * Parser for format: Department, Name, Role, Max_Units (or Max Units), Status.
 * First non-empty row is the header; column indices are detected from header names
 * so "Max_Units" in the 4th position (or any position) is read correctly.
 * Name column can contain commas and is normalized from "Last, First M." to "First M. Last".
 */
export function parseFacultyPaste(text: string): ParsedFacultyRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const [headerLine, ...dataLines] = lines;
  const headerCells = splitLine(headerLine);
  const idx = getHeaderIndices(headerCells);

  const rows: ParsedFacultyRow[] = [];

  for (const line of dataLines) {
    const cells = splitLine(line);
    if (cells.every((c) => !c.trim())) continue;

    const department = (cells[idx.department] ?? "").trim();
    const rawName = cells[idx.name] ?? "";
    const roleText = (cells[idx.role] ?? "").trim();
    const maxUnitsText = (cells[idx.maxUnits] ?? "").trim();
    const status = (cells[idx.status] ?? "").trim();

    const name = normalizeName(rawName);
    if (!name) continue;

    rows.push({ name, status, department, roleText, maxUnitsText });
  }

  return rows;
}

/**
 * Groups parsed rows by the raw department string (so we can show one dropdown per group).
 */
export function groupByDepartment(rows: ParsedFacultyRow[]): Map<string, ParsedFacultyRow[]> {
  const map = new Map<string, ParsedFacultyRow[]>();
  for (const row of rows) {
    const key = row.department.trim() || "(No department)";
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

/**
 * Builds MMSU-style email from full name: first letter of first name + middle initial + last name (no spaces) @ mmsu.edu.ph.
 * Preserves ñ/Ñ and other Unicode in the local part (e.g. "Juan Peña" -> jpeña@mmsu.edu.ph).
 * e.g. "Juan M. Dela Cruz" -> jmdelacruz@mmsu.edu.ph
 * Single-word names are treated as last name only: "Doe" -> doe@mmsu.edu.ph
 */
export function formatEmailFromName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";

  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  const middleParts = parts.length > 2 ? parts.slice(1, -1) : [];

  // Use proper Unicode lowercasing so Ñ -> ñ (e.g. for Peña, Nuñez).
  const firstLetter = first.length ? first[0].toLowerCase() : "";
  const middleInitial = middleParts.length && middleParts[0].length ? middleParts[0][0].toLowerCase() : "";
  const lastPart = last.toLowerCase().replace(/\s+/g, "");

  const local = firstLetter + middleInitial + lastPart;
  if (!local) return "";
  return `${local}@mmsu.edu.ph`;
}
