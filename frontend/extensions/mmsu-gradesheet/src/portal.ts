import { idKey } from "./studentNumber";

/** The portal's "no grade yet" option. */
const NO_GRADE = "0";

export interface PortalRow {
  key: string;
  studentNumber: string;
  name: string;
  degree: string;
  select: HTMLSelectElement;
  /** Selected grade, "" when the portal shows "---". */
  current: string;
  /** Grades the dropdown offers (without "---"). */
  options: string[];
  locked: boolean;
}

export interface PortalSheet {
  /** Id in the form action (…/gradesheet/update/<id>); identifies this gradesheet across the reload that saving causes. */
  sheetId: string;
  course: string;
  title: string;
  rows: PortalRow[];
  saveButton: HTMLElement;
}

const textOf = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** The cell right after the one labelled `label` ("Course" → "CPE 181_k12" in the Schedule Details table). */
function labelled(doc: Document, label: string): string {
  for (const cell of Array.from(doc.querySelectorAll("td"))) {
    if (textOf(cell) === label) return textOf(cell.nextElementSibling);
  }
  return "";
}

/**
 * Reads the gradesheet edit page. Returns null when the page is not one (or the portal changed enough that
 * the form, the grade dropdowns or the Save button cannot be found), so nothing is ever guessed.
 */
export function readSheet(doc: Document): PortalSheet | null {
  const form = doc.querySelector<HTMLFormElement>('form[action*="/gradesheet/update/"]');
  if (!form) return null;
  const sheetId = /\/gradesheet\/update\/(\d+)/.exec(form.getAttribute("action") ?? "")?.[1];
  const saveButton = form.querySelector<HTMLElement>('[name="savegradesheet"]');
  const selects = Array.from(form.querySelectorAll<HTMLSelectElement>('select[name^="grade_"]'));
  if (!sheetId || !saveButton || selects.length === 0) return null;

  const headers = Array.from(form.querySelectorAll("thead td, thead th")).map((cell) => textOf(cell).toLowerCase());
  const column = (label: string, fallback: number) => {
    const index = headers.indexOf(label);
    return index >= 0 ? index : fallback;
  };
  const nameAt = column("name", 2);
  const numberAt = column("student number", 3);
  const degreeAt = column("degree", 4);

  const rows: PortalRow[] = [];
  for (const select of selects) {
    const cells = select.closest("tr")?.children;
    if (!cells) continue;
    const studentNumber = textOf(cells[numberAt]);
    if (studentNumber === "") continue;
    const options = Array.from(select.options).map((option) => option.value).filter((value) => value !== NO_GRADE);
    rows.push({
      key: idKey(studentNumber),
      studentNumber,
      name: textOf(cells[nameAt]),
      degree: textOf(cells[degreeAt]),
      select,
      current: select.value === NO_GRADE ? "" : select.value,
      options,
      locked: select.disabled,
    });
  }
  if (rows.length === 0) return null;

  return {
    sheetId,
    course: labelled(doc, "Course"),
    title: textOf(doc.querySelector(".panel-heading strong")) || labelled(doc, "Title"),
    rows,
    saveButton,
  };
}

/** Messages the portal shows after a save (its flash alerts), for the verification report. */
export function readAlerts(doc: Document): string[] {
  return Array.from(doc.querySelectorAll(".alert, .alert-flash"))
    .map((el) => textOf(el))
    .filter((text) => text !== "")
    .slice(0, 3);
}
