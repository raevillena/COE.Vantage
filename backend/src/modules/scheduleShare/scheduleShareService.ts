import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { runUnscoped } from "../../utils/auditContext.js";
import { env } from "../../config/env.js";
import { badRequest, forbidden, notFound } from "../../utils/errors.js";
import { buildIcs } from "../../utils/scheduleIcs.js";

type Caller = { id: string; role: Role };
export type ShareKind = "FACULTY" | "CLASS";

const STAFF: Role[] = ["ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY", "OFFICER"];
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const origin = () => env.FRONTEND_ORIGIN.replace(/\/$/, "");

/** What the owner sees about a link. The token itself is shown once, when the link is made. */
function view(link: { id: string; kind: string; targetId: string; label: string; createdAt: Date; expiresAt: Date | null; revokedAt: Date | null; lastUsedAt: Date | null }) {
  const now = Date.now();
  return {
    id: link.id,
    kind: link.kind,
    targetId: link.targetId,
    label: link.label,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    lastUsedAt: link.lastUsedAt,
    status: link.revokedAt ? "revoked" : link.expiresAt && link.expiresAt.getTime() < now ? "expired" : "active",
  };
}

export async function createLink(caller: Caller, body: { kind: ShareKind; targetId: string; expiresInDays?: number }) {
  let label: string;
  if (body.kind === "FACULTY") {
    // faculty may share their own schedule; staff may share anyone's in their college (the college scope hides others)
    if (!STAFF.includes(caller.role) && body.targetId !== caller.id) throw forbidden("You can only share your own schedule.");
    const person = await prisma.user.findFirst({ where: { id: body.targetId, isDeleted: false }, select: { name: true } });
    if (!person) throw notFound("Faculty member not found");
    label = `${person.name}'s schedule`;
  } else {
    if (!STAFF.includes(caller.role)) throw forbidden("Your role cannot share a class schedule.");
    const cls = await prisma.studentClass.findFirst({ where: { id: body.targetId, isDeleted: false }, select: { name: true } });
    if (!cls) throw notFound("Class not found");
    label = `${cls.name} schedule`;
  }
  const token = randomBytes(32).toString("base64url");
  const link = await runUnscoped(() =>
    prisma.scheduleShareLink.create({
      data: {
        tokenHash: hash(token),
        kind: body.kind,
        targetId: body.targetId,
        label,
        createdById: caller.id,
        expiresAt: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000) : null,
      },
    })
  );
  // the page address is on the site; the calendar address is built by the page from the API address it talks to (the API can live on its own host)
  return { ...view(link), token, pageUrl: `${origin()}/s/${token}` };
}

export async function listMyLinks(caller: Caller, filter: { kind?: string; targetId?: string }) {
  const rows = await runUnscoped(() =>
    prisma.scheduleShareLink.findMany({
      where: { createdById: caller.id, revokedAt: null, ...(filter.kind ? { kind: filter.kind } : {}), ...(filter.targetId ? { targetId: filter.targetId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
  );
  return rows.map(view);
}

export async function revokeLink(caller: Caller, id: string) {
  const link = await runUnscoped(() => prisma.scheduleShareLink.findUnique({ where: { id } }));
  if (!link) throw notFound("Link not found");
  if (link.createdById !== caller.id && caller.role !== "ADMIN") throw forbidden("You can only turn off your own links.");
  await runUnscoped(() => prisma.scheduleShareLink.update({ where: { id }, data: { revokedAt: new Date() } }));
}

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

async function resolve(token: string) {
  const link = await runUnscoped(() => prisma.scheduleShareLink.findUnique({ where: { tokenHash: hash(token) } }));
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt.getTime() < Date.now())) throw notFound("This link is not active.");
  void runUnscoped(() => prisma.scheduleShareLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } })).catch(() => undefined);
  return link;
}

/** The blocks behind a link, for the college's Current Semester (the Scheduling Semester stands in when it is not set). */
export async function publicSchedule(token: string) {
  const link = await resolve(token);
  return runUnscoped(async () => {
    const owner =
      link.kind === "FACULTY"
        ? await prisma.user.findUnique({ where: { id: link.targetId }, select: { collegeId: true, name: true, isDeleted: true } })
        : await prisma.studentClass.findUnique({ where: { id: link.targetId }, select: { collegeId: true, name: true, isDeleted: true } });
    if (!owner || owner.isDeleted) throw notFound("This schedule no longer exists.");
    const college = owner.collegeId ? await prisma.college.findUnique({ where: { id: owner.collegeId } }) : null;
    const academicYearId = college?.calendarAcademicYearId ?? college?.currentAcademicYearId ?? null;
    const semester = college?.calendarSemester ?? college?.currentSemester ?? null;
    const year = academicYearId ? await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { name: true } }) : null;
    const loads =
      academicYearId && semester
        ? await prisma.facultyLoad.findMany({
            where: { academicYearId, semester, ...(link.kind === "FACULTY" ? { facultyId: link.targetId } : { studentClassId: link.targetId }) },
            include: { subject: { select: { code: true, name: true } }, room: { select: { name: true } }, studentClass: { select: { name: true } }, faculty: { select: { name: true } } },
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          })
        : [];
    const semLabel = semester === 1 ? "1st Semester" : semester === 2 ? "2nd Semester" : semester === 3 ? "Mid Year" : "";
    return {
      title: link.label,
      kind: link.kind,
      term: year && semLabel ? `${semLabel} ${year.name}` : null,
      blocks: loads.map((l) => ({
        id: l.id,
        dayOfWeek: l.dayOfWeek,
        day: DAYS[l.dayOfWeek] ?? "",
        startTime: l.startTime,
        endTime: l.endTime,
        subjectCode: l.subject.code,
        subjectName: l.subject.name,
        room: l.room?.name ?? l.roomDisplayName ?? null,
        className: l.studentClass.name,
        faculty: l.faculty?.name ?? l.facultyDisplayName ?? null,
      })),
    };
  });
}

export async function publicCalendar(token: string): Promise<{ ics: string; filename: string }> {
  const schedule = await publicSchedule(token);
  const ics = buildIcs({
    name: schedule.title,
    blocks: schedule.blocks.map((b) => ({
      uid: b.id,
      dayOfWeek: b.dayOfWeek,
      startTime: b.startTime,
      endTime: b.endTime,
      title: `${b.subjectCode} ${b.subjectName}`.trim(),
      location: b.room,
      description: [schedule.kind === "FACULTY" ? b.className : b.faculty].filter(Boolean).join(" - ") || null,
    })),
  });
  return { ics, filename: `${schedule.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "schedule"}.ics` };
}

export function assertKind(kind: string): asserts kind is ShareKind {
  if (kind !== "FACULTY" && kind !== "CLASS") throw badRequest("kind must be FACULTY or CLASS");
}
