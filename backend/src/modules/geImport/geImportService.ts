import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { badRequest, conflict, forbidden, notFound } from "../../utils/errors.js";
import { assertRoomAssignable, assertStudentClassInDepartment, requiredMinutesForSubject, timeToMinutes } from "../facultyLoads/facultyLoadService.js";
import type { CallerContext } from "../facultyLoads/facultyLoadService.js";
import { codeKey } from "./geParser.js";
import { assertTermUnlocked } from "../../utils/termLock.js";
import type { ImportBody } from "./geImportSchemas.js";

const DAY_LABEL = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const nameKey = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && aEnd > bStart;
const span = (start: string, end: string) => `${start}-${end}`;

type Db = Prisma.TransactionClient | typeof prisma;

/** The subjects an import can target: the class's curriculum, its year level, offered this semester (or both). */
export async function classSubjects(studentClassId: string, academicYearId: string, semester: number, caller: CallerContext) {
  const cls = await prisma.studentClass.findUnique({
    where: { id: studentClassId },
    include: { curriculum: { select: { id: true, name: true, code: true } } },
  });
  if (!cls || cls.isDeleted) throw notFound("Student class not found");
  await assertStudentClassInDepartment(studentClassId, caller);
  const [subjects, loads] = await Promise.all([
    prisma.subject.findMany({
      where: { isDeleted: false, curriculumId: cls.curriculumId, yearLevel: cls.yearLevel, OR: [{ semester: null }, { semester }] },
      select: { id: true, code: true, name: true, units: true, isLab: true, lecUnits: true, labUnits: true },
      orderBy: { code: "asc" },
    }),
    prisma.facultyLoad.findMany({ where: { studentClassId, academicYearId, semester }, select: { subjectId: true, dayOfWeek: true, startTime: true, endTime: true } }),
  ]);
  const scheduled = scheduledMinutes(loads);
  return {
    studentClass: { id: cls.id, name: cls.name, yearLevel: cls.yearLevel, curriculum: cls.curriculum },
    subjects: subjects.map((s) => ({
      ...s,
      codeKey: codeKey(s.code),
      requiredMinutes: requiredMinutesForSubject(s),
      scheduledMinutes: scheduled.get(s.id) ?? 0,
    })),
  };
}

/** Minutes per week per subject; a slot counted once. */
function scheduledMinutes(loads: { subjectId: string; dayOfWeek: number; startTime: string; endTime: string }[]) {
  const seen = new Set<string>();
  const out = new Map<string, number>();
  for (const l of loads) {
    const k = `${l.subjectId}|${l.dayOfWeek}|${l.startTime}|${l.endTime}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.set(l.subjectId, (out.get(l.subjectId) ?? 0) + timeToMinutes(l.endTime) - timeToMinutes(l.startTime));
  }
  return out;
}

export interface BlockResult {
  key: string;
  state: "new" | "exists" | "skipped";
  /** Must be fixed before saving. */
  blocking: string[];
  /** Worth a look; saving is still allowed. */
  warnings: string[];
  /** Set when the room text is one of the college's rooms. */
  roomId: string | null;
}

export interface SubjectResult {
  subjectId: string;
  code: string;
  requiredMinutes: number;
  existingMinutes: number;
  importMinutes: number;
}

export async function previewImport(body: ImportBody, caller: CallerContext, tx?: Prisma.TransactionClient) {
  const db: Db = tx ?? prisma;
  const { studentClassId, academicYearId, semester } = body;
  const cls = await db.studentClass.findUnique({ where: { id: studentClassId } });
  if (!cls || cls.isDeleted) throw notFound("Student class not found");
  await assertStudentClassInDepartment(studentClassId, caller);

  const subjectIds = [...new Set(body.blocks.map((b) => b.subjectId))];
  const subjects = await db.subject.findMany({ where: { id: { in: subjectIds }, isDeleted: false } });
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  const existingClass = await db.facultyLoad.findMany({ where: { studentClassId, academicYearId, semester } });

  // Rooms that are one of ours, matched by exact name (ignoring case, spaces and punctuation).
  const roomNames = [...new Set(body.blocks.filter((b) => !b.skip).map((b) => b.roomDisplayName?.trim()).filter((x): x is string => !!x))];
  const allRooms = roomNames.length ? await db.room.findMany({ where: { isDeleted: false }, select: { id: true, name: true, capacity: true } }) : [];
  const roomByKey = new Map(allRooms.map((r) => [nameKey(r.name), r]));

  const results = new Map<string, BlockResult>();
  const live: { block: ImportBody["blocks"][number]; result: BlockResult; roomId: string | null; roomCapacity: number | null }[] = [];

  for (const b of body.blocks) {
    const result: BlockResult = { key: b.key, state: "new", blocking: [], warnings: [], roomId: null };
    results.set(b.key, result);
    if (b.skip) {
      result.state = "skipped";
      continue;
    }
    const subject = subjectById.get(b.subjectId);
    if (!subject) result.blocking.push("Subject not found");
    else if (subject.curriculumId !== cls.curriculumId) result.blocking.push(`${subject.code} is not in this class's curriculum`);
    if (!/^\d{1,2}:\d{2}$/.test(b.startTime) || !/^\d{1,2}:\d{2}$/.test(b.endTime)) result.blocking.push("Enter a start and an end time");
    else if (timeToMinutes(b.endTime) <= timeToMinutes(b.startTime)) result.blocking.push("The end time is not after the start time; check AM and PM");
    if (!b.facultyDisplayName?.trim()) result.blocking.push("Enter the faculty name");
    if (!b.roomDisplayName?.trim()) result.blocking.push("Enter the room (TBA if unknown)");

    const identical = existingClass.some(
      (l) => l.subjectId === b.subjectId && l.dayOfWeek === b.dayOfWeek && l.startTime === b.startTime && l.endTime === b.endTime
    );
    if (identical && result.blocking.length === 0) {
      result.state = "exists";
      result.warnings.push("Already scheduled for this class");
      continue;
    }
    let roomId: string | null = null;
    let roomCapacity: number | null = null;
    const room = b.roomDisplayName ? roomByKey.get(nameKey(b.roomDisplayName)) : undefined;
    if (room) {
      try {
        await assertRoomAssignable(room.id, academicYearId, semester, caller);
        roomId = room.id;
        roomCapacity = room.capacity;
        result.roomId = room.id;
      } catch (err) {
        if (err instanceof Error) result.warnings.push(`${room.name} is one of your rooms but cannot be used: ${err.message} It is kept as text.`);
      }
    }
    live.push({ block: b, result, roomId, roomCapacity });
  }

  // Conflicts of the class, against saved blocks and between imported blocks.
  const code = (id: string) => subjectById.get(id)?.code ?? "subject";
  for (const item of live) {
    const { block: b, result } = item;
    if (result.blocking.some((m) => m.includes("time") || m.includes("Enter a start"))) continue;
    for (const l of existingClass) {
      if (l.dayOfWeek === b.dayOfWeek && overlaps(l.startTime, l.endTime, b.startTime, b.endTime)) {
        result.blocking.push(`Overlaps ${code(l.subjectId)} ${DAY_LABEL[l.dayOfWeek]} ${span(l.startTime, l.endTime)}, already scheduled for this class`);
      }
    }
    for (const other of live) {
      if (other === item || other.block.dayOfWeek !== b.dayOfWeek || other.result.blocking.some((m) => m.includes("time"))) continue;
      if (overlaps(other.block.startTime, other.block.endTime, b.startTime, b.endTime)) {
        result.blocking.push(`Overlaps another imported block: ${code(other.block.subjectId)} ${DAY_LABEL[other.block.dayOfWeek]} ${span(other.block.startTime, other.block.endTime)}`);
      }
    }
  }

  // Rooms and faculty already in the system (saved blocks of other classes).
  const facultyNames = [...new Set(live.map((i) => i.block.facultyDisplayName?.trim()).filter((x): x is string => !!x))];
  const roomIds = [...new Set(live.map((i) => i.roomId).filter((x): x is string => !!x))];
  const textRooms = [...new Set(live.filter((i) => !i.roomId).map((i) => i.block.roomDisplayName?.trim()).filter((x): x is string => !!x))];
  const others =
    facultyNames.length || roomIds.length || textRooms.length
      ? await db.facultyLoad.findMany({
          where: {
            academicYearId,
            semester,
            studentClassId: { not: studentClassId },
            OR: [
              ...facultyNames.map((n) => ({ facultyDisplayName: { equals: n, mode: "insensitive" as const } })),
              ...(roomIds.length ? [{ roomId: { in: roomIds } }] : []),
              ...textRooms.map((n) => ({ roomDisplayName: { equals: n, mode: "insensitive" as const } })),
            ],
          },
          include: { studentClass: { select: { name: true } } },
        })
      : [];

  for (const item of live) {
    const { block: b, result, roomId, roomCapacity } = item;
    if (result.blocking.some((m) => m.includes("time") || m.includes("Enter a start"))) continue;
    const fKey = nameKey(b.facultyDisplayName);
    const rKey = nameKey(b.roomDisplayName);
    const when = `${DAY_LABEL[b.dayOfWeek]} ${span(b.startTime, b.endTime)}`;
    for (const l of others) {
      if (l.dayOfWeek !== b.dayOfWeek || !overlaps(l.startTime, l.endTime, b.startTime, b.endTime)) continue;
      if (roomId && l.roomId === roomId) {
        result.blocking.push(`Room ${b.roomDisplayName} is in use by ${l.studentClass.name} (${code(l.subjectId)} ${span(l.startTime, l.endTime)})`);
      } else if (!roomId && !l.roomId && rKey && nameKey(l.roomDisplayName) === rKey) {
        result.warnings.push(`Room ${b.roomDisplayName} may be in use by ${l.studentClass.name} (${span(l.startTime, l.endTime)})`);
      }
      if (fKey && nameKey(l.facultyDisplayName) === fKey) {
        result.warnings.push(`${b.facultyDisplayName} may be double-booked: ${l.studentClass.name} ${span(l.startTime, l.endTime)}`);
      }
    }
    // Between imported blocks of this run (same names, different subject or time).
    for (const other of live) {
      if (other === item || other.block.dayOfWeek !== b.dayOfWeek || other.result.blocking.some((m) => m.includes("time"))) continue;
      if (!overlaps(other.block.startTime, other.block.endTime, b.startTime, b.endTime)) continue;
      if (fKey && nameKey(other.block.facultyDisplayName) === fKey && other.block.subjectId !== b.subjectId) {
        result.warnings.push(`${b.facultyDisplayName} is also in ${code(other.block.subjectId)} ${when} in this import`);
      }
      if (rKey && nameKey(other.block.roomDisplayName) === rKey) {
        result.warnings.push(`Room ${b.roomDisplayName} is also used by ${code(other.block.subjectId)} ${when} in this import`);
      }
    }
    if (roomId && roomCapacity != null && roomCapacity < cls.studentCount) {
      result.warnings.push(`${b.roomDisplayName} seats ${roomCapacity}, the class has ${cls.studentCount} students`);
    }
  }

  // Hours per subject against what the subject requires.
  const existing = scheduledMinutes(existingClass);
  const importMinutes = new Map<string, number>();
  for (const i of live) {
    if (i.result.state !== "new") continue;
    const m = timeToMinutes(i.block.endTime) - timeToMinutes(i.block.startTime);
    if (m > 0) importMinutes.set(i.block.subjectId, (importMinutes.get(i.block.subjectId) ?? 0) + m);
  }
  const subjectsOut: SubjectResult[] = [...importMinutes.keys()].map((id) => {
    const s = subjectById.get(id)!;
    return { subjectId: id, code: s.code, requiredMinutes: requiredMinutesForSubject(s), existingMinutes: existing.get(id) ?? 0, importMinutes: importMinutes.get(id) ?? 0 };
  });

  const blocks = [...results.values()].map((r) => ({ ...r, blocking: [...new Set(r.blocking)], warnings: [...new Set(r.warnings)] }));
  return {
    blocks,
    subjects: subjectsOut,
    blockingCount: blocks.filter((b) => b.blocking.length > 0).length,
    warningCount: blocks.filter((b) => b.warnings.length > 0 && b.state === "new").length,
  };
}

/** Creates every new block in one transaction after checking again. */
export async function saveImport(body: ImportBody, caller: CallerContext) {
  if (caller.role !== "CHAIRMAN") throw forbidden("Only a chairman imports GE schedules");
  await assertTermUnlocked(body.academicYearId, body.semester);
  return prisma.$transaction(async (tx) => {
    const preview = await previewImport(body, caller, tx);
    if (preview.blockingCount > 0) throw conflict(`${preview.blockingCount} block(s) still have problems to resolve. Nothing was saved.`);
    const byKey = new Map(preview.blocks.map((b) => [b.key, b]));
    const data = body.blocks
      .filter((b) => byKey.get(b.key)?.state === "new")
      .map((b) => {
        const roomId = byKey.get(b.key)!.roomId;
        return {
          facultyId: null,
          facultyDisplayName: b.facultyDisplayName!.trim(),
          subjectId: b.subjectId,
          studentClassId: body.studentClassId,
          roomId,
          roomDisplayName: roomId ? null : b.roomDisplayName!.trim(),
          dayOfWeek: b.dayOfWeek,
          startTime: b.startTime,
          endTime: b.endTime,
          semester: body.semester,
          academicYearId: body.academicYearId,
        };
      });
    if (data.length === 0) throw badRequest("There is nothing new to add");
    await tx.facultyLoad.createMany({ data });
    return { created: data.length, alreadyScheduled: preview.blocks.filter((b) => b.state === "exists").length, skipped: preview.blocks.filter((b) => b.state === "skipped").length };
  });
}
