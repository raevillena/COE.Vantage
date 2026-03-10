import type { ExtractedSubject } from "../types/api";

/**
 * Parses plain-text curriculum copied from IUSIS (e.g. from the checklist view).
 * Format: header lines (student id, program, name), then blocks of:
 *   "First Year" / "Second Year" / ... (year)
 *   "First Semester" / "Second Semester" / "Mid Year" (semester)
 *   "Code\tDescription\tunits\tGrade\tPre-requisite/s" (header row)
 *   Tab-separated data rows: Code, Description, units, Grade, Pre-requisite/s
 * Returns ExtractedSubject[] with yearLevel (1–5), semester (1=1st, 2=2nd, 3=mid year), code, name, units, prerequisites, isLab.
 */
export function parseIusisCurriculumClipboard(text: string): ExtractedSubject[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const results: ExtractedSubject[] = [];
  let currentYear = 1;
  let currentSemester: 1 | 2 | 3 = 1;
  /** True after we've seen a semester header and are reading subject rows until the next section. */
  let inTable = false;

  const yearPatterns: [RegExp, number][] = [
    [/^First\s+Year$/i, 1],
    [/^Second\s+Year$/i, 2],
    [/^Third\s+Year$/i, 3],
    [/^Fourth\s+Year$/i, 4],
    [/^Fifth\s+Year$/i, 5],
  ];

  const semesterPatterns: [RegExp, 1 | 2 | 3][] = [
    [/^First\s+Semester$/i, 1],
    [/^Second\s+Semester$/i, 2],
    [/^Mid\s+Year$/i, 3],
  ];

  const isTableHeader = (line: string): boolean => {
    const lower = line.toLowerCase();
    return lower.includes("code") && lower.includes("description") && (lower.includes("unit") || lower.includes("units"));
  };

  const parseSubjectRow = (line: string): ExtractedSubject | null => {
    const cols = line.split(/\t/).map((c) => c.trim());
    if (cols.length < 3) return null;
    const code = cols[0];
    const name = cols[1];
    const unitsText = cols[2].replace(/,/g, ".");
    const unitsNum = parseFloat(unitsText);
    const units = Math.max(0, Math.round(Number.isNaN(unitsNum) ? 3 : unitsNum));
    if (!code || !name) return null;
    const prerequisites = cols[4] ? cols[4].trim() || undefined : undefined;
    const isLab = /lab|laboratory/i.test(name) || /lab|laboratory/i.test(code);
    return {
      yearLevel: currentYear,
      semester: currentSemester,
      code,
      name,
      units,
      prerequisites,
      isLab,
    };
  };

  for (const line of lines) {
    if (!line) continue;

    for (const [re, year] of yearPatterns) {
      if (re.test(line)) {
        currentYear = year;
        inTable = false;
        break;
      }
    }

    for (const [re, sem] of semesterPatterns) {
      if (re.test(line)) {
        currentSemester = sem;
        inTable = false;
        break;
      }
    }

    if (isTableHeader(line)) {
      inTable = true;
      continue;
    }

    if (inTable && line.includes("\t")) {
      const subject = parseSubjectRow(line);
      if (subject) results.push(subject);
    }
  }

  return results;
}
