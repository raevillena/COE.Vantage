/**
 * Short code for Department / Curriculum names.
 * 1) A shorthand in parentheses at the end wins: "Computer Engineering Department (CPE)" -> "CPE".
 *    It must contain a letter, so "Curriculum (2018)" is not treated as a code.
 * 2) Otherwise fall back to the first letters of each word (can collide across names).
 */
const MAX_CODE_LENGTH = 8;

export function explicitCodeFromName(name: string): string | null {
  const m = /\(((?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9-]{1,8})\)\s*$/.exec(name.trim());
  return m ? m[1].toUpperCase() : null;
}

export function codeFromName(name: string): string {
  const explicit = explicitCodeFromName(name);
  if (explicit) return explicit;
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return words.map((w) => w[0]).join("").toUpperCase().slice(0, MAX_CODE_LENGTH);
}