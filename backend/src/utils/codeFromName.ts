/**
 * Generates a short code from a name (e.g. "Computer Engineering" → "CE").
 * Used for Department and Curriculum codes so users don't have to maintain them.
 */
const MAX_CODE_LENGTH = 8;

export function codeFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const acronym = words.map((w) => w[0]).join("").toUpperCase();
  return acronym.slice(0, MAX_CODE_LENGTH);
}
