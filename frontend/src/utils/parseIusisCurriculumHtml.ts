import type { ExtractedSubject } from "../types/api";

/**
 * Parses the Laravel IUSIS curriculum component HTML (paste from browser).
 * Expects structure: main table with rows for "First Year", "Second Year", etc.,
 * and per-row semester tables (First Semester, Second Semester, Mid Year) with columns Code, Description, units, Grade, Pre-requisite/s.
 * Returns subjects with yearLevel (1–5), semester (1=1st, 2=2nd, 3=mid year), code, name, units, optional prerequisites and isLab.
 */
export function parseIusisCurriculumHtml(html: string): ExtractedSubject[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = doc.querySelectorAll("table");
  let mainTable: HTMLTableElement | null = null;
  for (const table of tables) {
    const firstRow = table.querySelector("tr");
    if (!firstRow) continue;
    const text = firstRow.textContent ?? "";
    if (
      text.includes("First Year") ||
      text.includes("Second Year") ||
      text.includes("Third Year") ||
      text.includes("Fourth Year") ||
      text.includes("Fifth Year")
    ) {
      mainTable = table as HTMLTableElement;
      break;
    }
  }
  if (!mainTable) return [];

  const results: ExtractedSubject[] = [];
  let currentYear = 1;
  let currentSemester: 1 | 2 | 3 = 1;

  for (const tr of mainTable.querySelectorAll("tr")) {
    const h5 = tr.querySelector("h5");
    if (h5) {
      const title = (h5.textContent ?? "").trim();
      if (title.includes("First Year")) currentYear = 1;
      else if (title.includes("Second Year")) currentYear = 2;
      else if (title.includes("Third Year")) currentYear = 3;
      else if (title.includes("Fourth Year")) currentYear = 4;
      else if (title.includes("Fifth Year")) currentYear = 5;
    }

    const cells = tr.querySelectorAll("td");
    for (const cell of cells) {
      const cellText = (cell.textContent ?? "").trim();
      if (cellText.includes("First Semester")) currentSemester = 1;
      else if (cellText.includes("Second Semester")) currentSemester = 2;
      else if (cellText.includes("Mid Year")) currentSemester = 3;

      const innerTable = cell.querySelector("table");
      if (!innerTable) continue;
      const thead = innerTable.querySelector("thead");
      if (!thead || !(thead.textContent ?? "").includes("Code")) continue;
      const tbody = innerTable.querySelector("tbody");
      if (!tbody) continue;

      for (const subjectRow of tbody.querySelectorAll("tr")) {
        const tds = subjectRow.querySelectorAll("td");
        if (tds.length < 3) continue;
        const code = (tds[0].textContent ?? "").trim();
        const name = (tds[1].textContent ?? "").trim();
        const unitsText = (tds[2].textContent ?? "").trim().replace(/,/g, ".");
        const unitsNum = parseFloat(unitsText);
        const units = Math.max(0, Math.round(Number.isNaN(unitsNum) ? 3 : unitsNum));
        const prereq = tds[4] ? (tds[4].textContent ?? "").trim() : "";
        if (!code || !name) continue;
        const isLab =
          /lab|laboratory/i.test(name) || /lab|laboratory/i.test(code);
        results.push({
          yearLevel: currentYear,
          semester: currentSemester,
          code,
          name,
          units,
          prerequisites: prereq || undefined,
          isLab,
        });
      }
    }
  }

  return results;
}
