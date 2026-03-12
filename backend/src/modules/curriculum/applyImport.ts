import { prisma } from "../../prisma/client.js";
import { notFound } from "../../utils/errors.js";

/** One extracted subject row (no id). Used when applying IUSIS/clipboard import. */
export interface ExtractedSubject {
  yearLevel: number;
  semester?: number;
  code: string;
  name: string;
  units: number;
  prerequisites?: string;
  isLab?: boolean;
}

/**
 * Apply imported subjects: upsert by curriculumId + code. Returns counts and errors.
 * Used for IUSIS HTML and clipboard imports (no image/OpenAI).
 */
export async function applyImport(
  curriculumId: string,
  subjects: ExtractedSubject[]
): Promise<{ created: number; updated: number; errors: string[] }> {
  const curriculum = await prisma.curriculum.findUnique({ where: { id: curriculumId } });
  if (!curriculum) throw notFound("Curriculum not found");

  const errors: string[] = [];
  let created = 0;
  let updated = 0;

  for (const sub of subjects) {
    if (!sub.code?.trim() || !sub.name?.trim()) {
      errors.push("Skip: empty code or name");
      continue;
    }
    const existing = await prisma.subject.findFirst({
      where: { curriculumId, code: sub.code.trim() },
    });
    const isLab =
      sub.isLab ?? (/lab|laboratory/i.test(sub.name) || /lab|laboratory/i.test(sub.code));
    const yearLevel = sub.yearLevel >= 1 && sub.yearLevel <= 5 ? sub.yearLevel : null;
    const semester =
      typeof sub.semester === "number" && sub.semester >= 1 && sub.semester <= 3
        ? sub.semester
        : null;
    const data = {
      code: sub.code.trim(),
      name: sub.name.trim(),
      units: Math.max(0, Math.floor(Number(sub.units) || 0)),
      isLab,
      yearLevel,
      semester,
      curriculumId,
    };
    try {
      if (existing) {
        await prisma.subject.update({
          where: { id: existing.id },
          data: { name: data.name, units: data.units, isLab: data.isLab, yearLevel: data.yearLevel, semester: data.semester },
        });
        updated++;
      } else {
        await prisma.subject.create({ data });
        created++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${sub.code}: ${msg}`);
    }
  }

  return { created, updated, errors };
}
