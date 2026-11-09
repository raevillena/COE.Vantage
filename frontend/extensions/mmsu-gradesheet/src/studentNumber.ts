/** Comparison key of a student number: "23-050573", "23050573" and "23 - 050573" are the same student. */
export function idKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Whether a pasted cell can be a student number (six or more digits, no words). */
export function looksLikeStudentNumber(raw: string): boolean {
  const text = raw.trim();
  if (text.length === 0 || text.length > 16) return false;
  if (/[A-Za-z]{4,}/.test(text)) return false;
  return text.replace(/\D/g, "").length >= 6;
}

/** Name words used to sanity-check a matched student ("DELA CRUZ, JUAN" vs "Juan Dela Cruz"). */
function nameWords(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

/** True when two names share no word at all, which for the same student number means a wrong row. */
export function namesDisagree(sourceName: string, portalName: string): boolean {
  const source = nameWords(sourceName);
  const portal = new Set(nameWords(portalName));
  if (source.length === 0 || portal.size === 0) return false;
  return !source.some((word) => portal.has(word));
}
