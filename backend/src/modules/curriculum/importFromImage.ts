import OpenAI from "openai";
import Tesseract from "tesseract.js";
import { env } from "../../config/env.js";
import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";

/** One extracted or to-apply subject row (no id). */
export interface ExtractedSubject {
  yearLevel: number;
  semester?: number;
  code: string;
  name: string;
  units: number;
  prerequisites?: string;
  isLab?: boolean;
}

const VISION_PROMPT = `This image is a curriculum checklist (courses by year and semester). For each course row, extract:
- year: number 1-5 (First Year=1, Second Year=2, etc.)
- semester: number 1=First Semester, 2=Second Semester, 3=Mid Year (omit if not visible)
- code: course code (e.g. "MATH 1", "IT 21")
- name: course description/name
- units: number (credits/units)
- prerequisites: string or empty if none
- isLab: boolean true if the course name or code suggests it is a laboratory (e.g. "Lab", "Laboratory"); otherwise false

Return a JSON array of objects with those keys only. No other text. Example: [{"yearLevel":1,"semester":1,"code":"MATH 1","name":"Calculus","units":4,"prerequisites":"","isLab":false}]`;

function getOpenAIClient(): OpenAI {
  const key = env.OPENAI_API_KEY;
  if (!key) {
    throw badRequest(
      "OPENAI_API_KEY is not set. Add it to your .env to use curriculum import from image."
    );
  }
  return new OpenAI({ apiKey: key });
}

function normalizeExtracted(raw: unknown): ExtractedSubject[] {
  if (!Array.isArray(raw)) return [];
  const result: ExtractedSubject[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const yearLevel = typeof obj.yearLevel === "number" ? obj.yearLevel : Number(obj.yearLevel);
    const units = typeof obj.units === "number" ? obj.units : Number(obj.units);
    const code = String(obj.code ?? "").trim();
    const name = String(obj.name ?? obj.description ?? "").trim();
    if (!code || !name) continue;
    const y = Number.isInteger(yearLevel) && yearLevel >= 1 && yearLevel <= 5 ? yearLevel : 1;
    const u = Number.isInteger(units) && units >= 0 ? units : 3;
    result.push({
      yearLevel: y,
      semester:
        typeof obj.semester === "number" && obj.semester >= 1 && obj.semester <= 3
          ? obj.semester
          : undefined,
      code,
      name,
      units: u,
      prerequisites: typeof obj.prerequisites === "string" ? obj.prerequisites.trim() || undefined : undefined,
      isLab: typeof obj.isLab === "boolean" ? obj.isLab : /lab|laboratory/i.test(name) || /lab|laboratory/i.test(code),
    });
  }
  return result;
}

/** Parse OCR text (curriculum checklist) into extracted subjects. Heuristic: detect year/semester headers, then lines that look like "CODE description N" with N = units 1-5. */
function parseOCRText(text: string): ExtractedSubject[] {
  const result: ExtractedSubject[] = [];
  let currentYear = 1;
  let currentSemester = 1;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const yearPatterns: [RegExp, number][] = [
    [/first\s+year/i, 1],
    [/second\s+year/i, 2],
    [/third\s+year/i, 3],
    [/fourth\s+year/i, 4],
    [/fifth\s+year/i, 5],
    [/1st\s+year/i, 1],
    [/2nd\s+year/i, 2],
    [/3rd\s+year/i, 3],
    [/4th\s+year/i, 4],
    [/5th\s+year/i, 5],
  ];
  const semesterPatterns: [RegExp, number][] = [
    [/first\s+semester/i, 1],
    [/second\s+semester/i, 2],
    [/mid\s+year/i, 3],
    [/1st\s+semester/i, 1],
    [/2nd\s+semester/i, 2],
  ];

  const skipPatterns = [
    /^code$/i, /^description$/i, /^units$/i, /^grade$/i, /^pre-?requisites$/i,
    /^total$/i, /^grand\s+total$/i, /^year\s+\d+$/i,
  ];

  for (const line of lines) {
    if (skipPatterns.some((p) => p.test(line))) continue;
    for (const [re, year] of yearPatterns) {
      if (re.test(line)) {
        currentYear = year;
        break;
      }
    }
    for (const [re, sem] of semesterPatterns) {
      if (re.test(line)) {
        currentSemester = sem;
        break;
      }
    }

    // Course row: ends with a single digit 1-5 (units); may have grade (decimal) before it
    const unitsMatch = line.match(/\s+([1-5])\s*$/);
    if (!unitsMatch) continue;
    const units = parseInt(unitsMatch[1], 10);
    const beforeUnits = line.slice(0, unitsMatch.index).trim();
    // Before units there may be grade (e.g. "2.75"); take it out so we have "code description"
    const gradeMatch = beforeUnits.match(/\s+(\d\.\d{1,2})\s*$/);
    const codeAndName = gradeMatch ? beforeUnits.slice(0, gradeMatch.index).trim() : beforeUnits;
    if (!codeAndName || codeAndName.length < 2) continue;

    // Code is typically first 1-2 tokens (e.g. "MATH 1", "CP1"); rest is name
    const tokens = codeAndName.split(/\s+/);
    let code: string;
    let name: string;
    if (tokens.length === 1) {
      code = tokens[0];
      name = tokens[0];
    } else if (tokens.length === 2 && tokens[1].length <= 3) {
      code = tokens.join(" ");
      name = tokens.join(" ");
    } else {
      code = tokens[0];
      name = tokens.slice(1).join(" ");
    }
    if (!code || code.length > 20) continue;

    result.push({
      yearLevel: currentYear,
      semester: currentSemester,
      code,
      name: name || code,
      units,
      isLab: /lab|laboratory/i.test(name) || /lab|laboratory/i.test(code),
    });
  }
  return result;
}

/**
 * Extract using OCR (Tesseract). No API key required. Used when OPENAI_API_KEY is not set.
 */
async function extractFromImageWithOCR(imageBuffer: Buffer): Promise<ExtractedSubject[]> {
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: () => {},
  });
  try {
    const { data } = await worker.recognize(imageBuffer);
    return parseOCRText(data.text);
  } finally {
    await worker.terminate();
  }
}

/**
 * Extract curriculum subjects from an image. Uses Vision API when OPENAI_API_KEY is set; otherwise falls back to OCR (Tesseract). No DB write.
 */
export async function extractFromImage(imageBuffer: Buffer, mimeType: string): Promise<{ extracted: ExtractedSubject[] }> {
  if (env.OPENAI_API_KEY) {
    return extractFromImageWithVision(imageBuffer, mimeType);
  }
  const extracted = await extractFromImageWithOCR(imageBuffer);
  return { extracted };
}

/**
 * Extract using OpenAI Vision API. Used when OPENAI_API_KEY is set.
 */
async function extractFromImageWithVision(imageBuffer: Buffer, mimeType: string): Promise<{ extracted: ExtractedSubject[] }> {
  const client = getOpenAIClient();
  const base64 = imageBuffer.toString("base64");
  const mediaType = mimeType || "image/png";
  const url = `data:${mediaType};base64,${base64}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          { type: "image_url", image_url: { url } },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    return { extracted: [] };
  }

  // Try to parse JSON array from the response (may be wrapped in markdown code block)
  let raw: unknown;
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      raw = JSON.parse(jsonMatch[0]);
    } catch {
      raw = [];
    }
  } else {
    try {
      raw = JSON.parse(content);
    } catch {
      return { extracted: [] };
    }
  }

  const extracted = normalizeExtracted(raw);
  return { extracted };
}

/**
 * Apply imported subjects: upsert by curriculumId + code. Returns counts and errors.
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
      errors.push(`Skip: empty code or name`);
      continue;
    }
    const existing = await prisma.subject.findFirst({
      where: { curriculumId, code: sub.code.trim() },
    });
    const isLab =
      sub.isLab ?? (/lab|laboratory/i.test(sub.name) || /lab|laboratory/i.test(sub.code));
    const data = {
      code: sub.code.trim(),
      name: sub.name.trim(),
      units: Math.max(0, Math.floor(Number(sub.units) || 0)),
      isLab,
      yearLevel: sub.yearLevel >= 1 && sub.yearLevel <= 5 ? sub.yearLevel : null,
      curriculumId,
    };
    try {
      if (existing) {
        await prisma.subject.update({
          where: { id: existing.id },
          data: { name: data.name, units: data.units, isLab: data.isLab, yearLevel: data.yearLevel },
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
