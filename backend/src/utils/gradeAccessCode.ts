import { randomInt } from "node:crypto";

/**
 * Cryptographically secure 6-digit numeric access code for `GradeRecord.code` (public lookup + emails).
 *
 * - Uses **`crypto.randomInt`** (OS CSPRNG via the same secure source as `randomBytes`), not `Math.random`.
 * - **Uniform** in **000000** … **999999** (always six decimal digits, leading zeros preserved).
 * - ~**20 bits** of entropy — for very large rosters, two students could theoretically share a code; public lookup
 *   still requires matching **studentNumber** + **code**, and duplicate codes in one subject are unlikely for typical class sizes.
 *
 * User-supplied codes from CSV/API may still be any string up to schema limits; this helper is only for server generation.
 */
export function newGradeRecordAccessCode(): string {
  const n = randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}
