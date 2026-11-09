/** A student class name read into its parts, e.g. "BS CE 4A" → program "BS CE", year level 4, section "A". */
export interface ClassNameParts {
  program: string;
  /** The year level the name says (1-5), or null when the name does not say one. */
  yearLevel: number | null;
  section: string;
}

const MAX_YEAR_LEVEL = 5;

const validYear = (n: number) => (n >= 1 && n <= MAX_YEAR_LEVEL ? n : null);

/**
 * Reads a class name: a year written out ("3rd year", "Year 3") wins; otherwise the last digit with an
 * optional section after it ("BSCE-3A", "BS CE 4A", "BSCEP 1B", "BSCE 2"). A number of two digits or more
 * (a batch or year such as "2024") is not a year level.
 */
export function parseClassName(raw: string): ClassNameParts {
  const name = raw.trim().replace(/\s+/g, " ");
  const written = /(?<!\d)([1-9])\s*(?:st|nd|rd|th)\s*-?\s*year\b/i.exec(name) ?? /\byear\s*-?\s*([1-9])(?!\d)/i.exec(name);
  if (written) {
    return { program: name.slice(0, written.index).replace(/[\s\-_]+$/, ""), yearLevel: validYear(Number(written[1])), section: "" };
  }
  const trailing = /^(.*?)(?<!\d)(\d)(?!\d)\s*[-_]?\s*([A-Za-z]{0,3})$/.exec(name);
  if (!trailing) return { program: name, yearLevel: null, section: "" };
  return { program: trailing[1].replace(/[\s\-_]+$/, ""), yearLevel: validYear(Number(trailing[2])), section: trailing[3].toUpperCase() };
}
