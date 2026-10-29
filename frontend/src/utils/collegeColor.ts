import type { College } from "../types/api";

const COLORS = ["#1b7fa0", "#7c3aed", "#c2410c", "#15803d", "#be185d", "#0e7490", "#4d7c0f", "#b45309", "#4338ca", "#a21caf"];

/** A steady colour for a college, so its badge looks the same everywhere. */
export function collegeColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** The short label of a college: its code, or the capitals of its name. */
export function collegeCode(c: Pick<College, "name" | "code">): string {
  if (c.code) return c.code.slice(0, 4).toUpperCase();
  const caps = c.name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && w.length > 2).map((w) => w[0]).join("");
  return (caps || c.name.slice(0, 3)).slice(0, 4).toUpperCase();
}
