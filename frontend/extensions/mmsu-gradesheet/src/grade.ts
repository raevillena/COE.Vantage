/** What a pasted grade cell means for the portal's grade dropdown. */
export type GradeResult =
  | { kind: "grade"; value: string }
  | { kind: "blank" }
  | { kind: "invalid"; reason: string };

const WORDS: Record<string, string> = { INCOMPLETE: "INC", DROPPED: "DRP", DROP: "DRP", "IN PROGRESS": "IP" };

/**
 * Turns one pasted cell into an option of the portal's grade dropdown.
 * `allowed` is the portal's own option list (without the "---" placeholder), so a grade the
 * portal does not offer (for example 3.25) is refused instead of being silently rounded.
 */
export function resolveGrade(raw: string, allowed: string[]): GradeResult {
  const text = raw.trim().replace(/^"|"$/g, "").trim();
  if (text === "" || /^[-–—]+$/.test(text)) return { kind: "blank" };

  const numeric = /^\d+(?:[.,]\d+)?$/.exec(text);
  if (numeric) {
    const value = Number(text.replace(",", ".")).toFixed(2);
    return allowed.includes(value)
      ? { kind: "grade", value }
      : { kind: "invalid", reason: `${value} is not a grade the portal offers` };
  }

  const upper = text.toUpperCase().replace(/\s+/g, " ");
  const word = WORDS[upper] ?? upper;
  const match = allowed.find((option) => option.toUpperCase() === word);
  return match ? { kind: "grade", value: match } : { kind: "invalid", reason: `"${text}" is not a grade the portal offers` };
}
