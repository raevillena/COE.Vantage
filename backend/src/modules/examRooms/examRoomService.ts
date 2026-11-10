import { prisma } from "../../prisma/client.js";
import { badRequest, conflict, forbidden, notFound } from "../../utils/errors.js";
import { currentActor, runUnscoped } from "../../utils/auditContext.js";
import { resolveCollegeId } from "../../utils/collegeScope.js";
import { TEACHING_ROLES } from "../../utils/teachingRoles.js";
import { audit } from "../audit/auditService.js";
import { notifyUsers } from "../notifications/notificationService.js";
import type { CreateExamReservationBody, ExamTermQuery, SetExamPeriodBody } from "./examRoomSchemas.js";

/** The signed-in person, as the routes pass them in. */
export interface ExamCaller {
  id: string;
  role: string;
  departmentId: string | null;
  name: string;
}

type Kind = "MIDTERM" | "FINAL";
const KIND_LABEL: Record<Kind, string> = { MIDTERM: "Midterm", FINAL: "Final" };
/** Exams can be placed between these times. */
const DAY_START = 6 * 60;
const DAY_END = 22 * 60;
const MAX_PERIOD_DAYS = 21;

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;
/** "2026-12-14" -> a date-only value (UTC midnight) and back. */
const parseDay = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const formatDay = (d: Date) => d.toISOString().slice(0, 10);
const prettyDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

// ---------------------------------------------------------------- exam rounds

const periodDto = (p: { id: string; academicYearId: string; semester: number; kind: Kind; startDate: Date; endDate: Date; isOpen: boolean; openedByName: string | null; openedAt: Date | null }) => ({
  id: p.id,
  academicYearId: p.academicYearId,
  semester: p.semester,
  kind: p.kind,
  startDate: formatDay(p.startDate),
  endDate: formatDay(p.endDate),
  isOpen: p.isOpen,
  openedByName: p.openedByName,
  openedAt: p.openedAt,
});

export async function listPeriods(query: ExamTermQuery) {
  const rows = await prisma.examPeriod.findMany({ where: { academicYearId: query.academicYearId, semester: query.semester }, orderBy: { kind: "asc" } });
  return rows.map(periodDto);
}

/** Sets the dates of a round (Midterm or Final). It starts closed; the college secretary opens it for plotting. */
export async function setPeriod(body: SetExamPeriodBody, caller: ExamCaller) {
  if (body.endDate < body.startDate) throw badRequest("The last day is before the first day.");
  const days = (parseDay(body.endDate).getTime() - parseDay(body.startDate).getTime()) / 86_400_000 + 1;
  if (days > MAX_PERIOD_DAYS) throw badRequest(`An exam round can span at most ${MAX_PERIOD_DAYS} days.`);
  const year = await prisma.academicYear.findUnique({ where: { id: body.academicYearId } });
  if (!year || year.isDeleted) throw notFound("Academic year not found");
  const mine = currentActor()?.collegeId;
  if (mine && body.collegeId && body.collegeId !== mine) throw forbidden("You can only set your own college's exam dates.");
  const collegeId = await resolveCollegeId(prisma, mine ?? body.collegeId);

  // blocks already plotted must stay inside the new dates
  const outside = await prisma.examReservation.count({
    where: {
      collegeId,
      academicYearId: body.academicYearId,
      semester: body.semester,
      kind: body.kind,
      OR: [{ date: { lt: parseDay(body.startDate) } }, { date: { gt: parseDay(body.endDate) } }],
    },
  });
  if (outside > 0) throw conflict(`${outside} room block${outside === 1 ? " is" : "s are"} outside these dates. Remove them or keep the dates that cover them.`);

  const existing = await prisma.examPeriod.findFirst({ where: { collegeId, academicYearId: body.academicYearId, semester: body.semester, kind: body.kind } });
  const data = { startDate: parseDay(body.startDate), endDate: parseDay(body.endDate) };
  const saved = existing
    ? await prisma.examPeriod.update({ where: { id: existing.id }, data })
    : await prisma.examPeriod.create({ data: { collegeId, academicYearId: body.academicYearId, semester: body.semester, kind: body.kind, ...data } });
  await audit({
    entityType: "ACADEMIC_YEAR",
    entityId: year.id,
    entityLabel: year.name,
    action: existing ? "UPDATE" : "CREATE",
    summary: `Set the ${KIND_LABEL[body.kind]} exam dates of ${year.name}, semester ${body.semester}: ${body.startDate} to ${body.endDate}`,
    academicYearId: year.id,
    semester: body.semester,
    collegeId,
  });
  return periodDto(saved);
}

/** Opens or closes a round for plotting. Only the college secretary (or the admin) does this. */
export async function setPeriodOpen(id: string, open: boolean, caller: ExamCaller) {
  const period = await prisma.examPeriod.findUnique({ where: { id } });
  if (!period) throw notFound("Exam round not found");
  if (period.isOpen === open) return periodDto(period);
  const saved = await prisma.examPeriod.update({ where: { id }, data: { isOpen: open, openedByName: open ? caller.name : null, openedAt: open ? new Date() : null } });
  const year = await prisma.academicYear.findUnique({ where: { id: period.academicYearId }, select: { name: true } });
  await audit({
    entityType: "ACADEMIC_YEAR",
    entityId: period.academicYearId,
    entityLabel: year?.name,
    action: open ? "OPEN" : "CLOSE",
    summary: `${open ? "Opened" : "Closed"} ${KIND_LABEL[period.kind]} exam room reservation for ${year?.name ?? "the term"}, semester ${period.semester}`,
    academicYearId: period.academicYearId,
    semester: period.semester,
    collegeId: period.collegeId,
  });
  if (open) {
    void (async () => {
      const people = await runUnscoped(() => prisma.user.findMany({ where: { collegeId: period.collegeId, isDeleted: false, role: { in: TEACHING_ROLES } }, select: { id: true } }));
      await notifyUsers(
        people.map((u) => u.id),
        {
          type: "EXAM_ROOM",
          title: `${KIND_LABEL[period.kind]} exam room reservation is open`,
          body: `${formatDay(period.startDate)} to ${formatDay(period.endDate)}. First plotted, first served.`,
          link: "/exam-rooms",
          groupKey: `exam-open-${period.kind}`,
        },
        { exceptUserId: caller.id }
      );
    })();
  }
  return periodDto(saved);
}

export async function deletePeriod(id: string) {
  const period = await prisma.examPeriod.findUnique({ where: { id } });
  if (!period) throw notFound("Exam round not found");
  const blocks = await prisma.examReservation.count({
    where: { collegeId: period.collegeId, academicYearId: period.academicYearId, semester: period.semester, kind: period.kind },
  });
  if (blocks > 0) throw conflict(`${blocks} room block${blocks === 1 ? " is" : "s are"} plotted in this round. Remove them first.`);
  await prisma.examPeriod.delete({ where: { id } });
}

// ---------------------------------------------------------------- what the page shows

/** Every room of the college, with the department that owns it. */
export async function listRooms() {
  const rooms = await prisma.room.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true, capacity: true, isLab: true, departmentId: true, department: { select: { id: true, name: true, code: true } } },
    orderBy: { name: "asc" },
  });
  return rooms;
}

/** The subjects (with their classes) this person teaches in the term: what they can plot. */
export async function listMyItems(caller: ExamCaller, query: ExamTermQuery) {
  const loads = await prisma.facultyLoad.findMany({
    where: { facultyId: caller.id, academicYearId: query.academicYearId, semester: query.semester },
    select: { subjectId: true, studentClassId: true, subject: { select: { code: true, name: true } }, studentClass: { select: { name: true, studentCount: true } } },
    distinct: ["subjectId", "studentClassId"],
  });
  const reserved = await prisma.examReservation.groupBy({
    by: ["subjectId", "studentClassId", "kind"],
    where: { academicYearId: query.academicYearId, semester: query.semester, subjectId: { in: loads.map((l) => l.subjectId) } },
    _count: { _all: true },
  });
  const count = (subjectId: string, studentClassId: string, kind: Kind) =>
    reserved.find((r) => r.subjectId === subjectId && r.studentClassId === studentClassId && r.kind === kind)?._count._all ?? 0;
  return loads
    .map((l) => ({
      subjectId: l.subjectId,
      subjectCode: l.subject.code,
      subjectName: l.subject.name,
      studentClassId: l.studentClassId,
      className: l.studentClass.name,
      studentCount: l.studentClass.studentCount,
      reserved: { MIDTERM: count(l.subjectId, l.studentClassId, "MIDTERM"), FINAL: count(l.subjectId, l.studentClassId, "FINAL") },
    }))
    .sort((a, b) => a.subjectCode.localeCompare(b.subjectCode) || a.className.localeCompare(b.className));
}

export async function listReservations(query: ExamTermQuery) {
  const rows = await prisma.examReservation.findMany({
    where: { academicYearId: query.academicYearId, semester: query.semester, ...(query.kind ? { kind: query.kind } : {}) },
    include: {
      room: { select: { id: true, name: true, departmentId: true } },
      subject: { select: { code: true, name: true } },
      studentClass: { select: { name: true } },
      owner: { select: { id: true, name: true } },
      removalRequests: { where: { status: "PENDING" }, select: { id: true, message: true, requestedBy: { select: { name: true } } }, take: 1 },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    roomId: r.roomId,
    roomName: r.room.name,
    roomDepartmentId: r.room.departmentId,
    subjectId: r.subjectId,
    subjectCode: r.subject.code,
    subjectName: r.subject.name,
    studentClassId: r.studentClassId,
    className: r.studentClass.name,
    ownerId: r.ownerId,
    ownerName: r.owner.name,
    date: formatDay(r.date),
    startTime: r.startTime,
    endTime: r.endTime,
    removalRequest: r.removalRequests[0] ? { id: r.removalRequests[0].id, message: r.removalRequests[0].message, requestedByName: r.removalRequests[0].requestedBy.name } : null,
  }));
}

// ---------------------------------------------------------------- plotting (first plotted, first served)

export async function createReservation(body: CreateExamReservationBody, caller: ExamCaller) {
  const start = toMinutes(body.startTime);
  const end = toMinutes(body.endTime);
  if (end <= start) throw badRequest("The end time must be after the start time.");
  if (start < DAY_START || end > DAY_END) throw badRequest("Exams can be placed between 6:00 AM and 10:00 PM.");

  const period = await prisma.examPeriod.findFirst({ where: { academicYearId: body.academicYearId, semester: body.semester, kind: body.kind } });
  if (!period) throw badRequest(`The ${KIND_LABEL[body.kind]} exam dates have not been set yet.`);
  if (!period.isOpen) throw badRequest(`${KIND_LABEL[body.kind]} room reservation is not open. The college secretary opens it.`);
  const date = parseDay(body.date);
  if (date < period.startDate || date > period.endDate) throw badRequest(`That date is outside the ${KIND_LABEL[body.kind]} exam dates (${formatDay(period.startDate)} to ${formatDay(period.endDate)}).`);

  // a person plots only what they teach this term
  const teaches = await prisma.facultyLoad.findFirst({
    where: { facultyId: caller.id, academicYearId: body.academicYearId, semester: body.semester, subjectId: body.subjectId, studentClassId: body.studentClassId },
    select: { id: true },
  });
  if (!teaches) throw forbidden("You can only reserve rooms for subjects and classes you teach this term.");

  const room = await prisma.room.findFirst({ where: { id: body.roomId, isDeleted: false }, select: { id: true, name: true, collegeId: true } });
  if (!room) throw notFound("Room not found");

  return prisma.$transaction(async (tx) => {
    // two people dropping into the same room at once: the first one in wins, the other sees the conflict
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${body.roomId}))`;

    const sameRoom = await tx.examReservation.findMany({
      where: { roomId: body.roomId, date },
      select: { startTime: true, endTime: true, subject: { select: { code: true } }, studentClass: { select: { name: true } }, owner: { select: { name: true } } },
    });
    const taken = sameRoom.find((r) => overlaps(start, end, toMinutes(r.startTime), toMinutes(r.endTime)));
    if (taken) throw conflict(`${room.name} is already taken ${taken.startTime}–${taken.endTime} by ${taken.owner.name} (${taken.subject.code}, ${taken.studentClass.name}).`);

    // a class cannot sit two exams at once (rooms may differ; the same teacher may have several rooms at one time)
    const sameClass = await tx.examReservation.findMany({
      where: { studentClassId: body.studentClassId, date },
      select: { startTime: true, endTime: true, subject: { select: { code: true } }, room: { select: { name: true } } },
    });
    const clash = sameClass.find((r) => overlaps(start, end, toMinutes(r.startTime), toMinutes(r.endTime)));
    if (clash) throw conflict(`This class already has an exam ${clash.startTime}–${clash.endTime} (${clash.subject.code} in ${clash.room.name}).`);

    return tx.examReservation.create({
      data: {
        collegeId: room.collegeId,
        academicYearId: body.academicYearId,
        semester: body.semester,
        kind: body.kind,
        roomId: body.roomId,
        subjectId: body.subjectId,
        studentClassId: body.studentClassId,
        ownerId: caller.id,
        date,
        startTime: body.startTime,
        endTime: body.endTime,
      },
      select: { id: true },
    });
  });
}

/** Loads a block with what is needed to decide who may touch it. */
async function loadReservation(id: string) {
  const r = await prisma.examReservation.findUnique({
    where: { id },
    include: { room: { select: { name: true, departmentId: true } }, subject: { select: { code: true } }, studentClass: { select: { name: true } } },
  });
  if (!r) throw notFound("Room block not found");
  return r;
}

const describe = (r: { subject: { code: string }; studentClass: { name: string }; room: { name: string }; date: Date; startTime: string; endTime: string }) =>
  `${r.subject.code} (${r.studentClass.name}) in ${r.room.name}, ${prettyDay(r.date)} ${r.startTime}–${r.endTime}`;

/** The owner takes a block away, or the chairman of the room's department removes it by force. */
export async function removeReservation(id: string, caller: ExamCaller) {
  const r = await loadReservation(id);
  const isOwner = r.ownerId === caller.id;
  const isRoomChairman = caller.role === "CHAIRMAN" && caller.departmentId !== null && caller.departmentId === r.room.departmentId;
  if (!isOwner && !isRoomChairman && caller.role !== "ADMIN") {
    throw forbidden("Only the person who reserved this block, or the chairman of the room's department, can remove it.");
  }
  await prisma.examReservation.delete({ where: { id } });
  if (!isOwner) {
    await audit({ entityType: "ROOM", entityId: r.roomId, entityLabel: r.room.name, action: "DELETE", summary: `Removed an exam room block: ${describe(r)}` });
    void notifyUsers([r.ownerId], { type: "EXAM_ROOM", title: "An exam room block of yours was removed", body: `${describe(r)}, by ${caller.name}.`, link: "/exam-rooms", groupKey: "exam-removed" }, { exceptUserId: caller.id });
  }
}

// ---------------------------------------------------------------- asking an owner to free a block

/** The chairman of the room's department asks the owner of a block to remove it. */
export async function requestRemoval(reservationId: string, message: string | undefined, caller: ExamCaller) {
  const r = await loadReservation(reservationId);
  if (r.ownerId === caller.id) throw badRequest("This is your own block: remove it directly.");
  if (!(caller.role === "CHAIRMAN" && caller.departmentId !== null && caller.departmentId === r.room.departmentId)) {
    throw forbidden("Only the chairman of the room's department can ask for a block to be removed.");
  }
  const pending = await prisma.examRemovalRequest.findFirst({ where: { reservationId, status: "PENDING" } });
  if (pending) throw conflict("A request to remove this block is already waiting for its owner.");
  const request = await prisma.examRemovalRequest.create({
    data: { collegeId: r.collegeId, reservationId, requestedById: caller.id, message: message || null },
    select: { id: true },
  });
  void notifyUsers(
    [r.ownerId],
    { type: "EXAM_ROOM", title: "A chairman asks you to free an exam room block", body: `${describe(r)}. ${caller.name}${message ? `: ${message}` : ""}`, link: "/exam-rooms", groupKey: `exam-request-${reservationId}` },
    { exceptUserId: caller.id }
  );
  return request;
}

/** Requests waiting for me (my blocks) and the ones I sent (waiting or declined). */
export async function listRequests(caller: ExamCaller) {
  const include = {
    reservation: { include: { room: { select: { name: true } }, subject: { select: { code: true } }, studentClass: { select: { name: true } }, owner: { select: { name: true } } } },
    requestedBy: { select: { name: true } },
  } as const;
  const [incoming, outgoing] = await Promise.all([
    prisma.examRemovalRequest.findMany({ where: { status: "PENDING", reservation: { ownerId: caller.id } }, include, orderBy: { createdAt: "desc" } }),
    prisma.examRemovalRequest.findMany({ where: { requestedById: caller.id, status: { in: ["PENDING", "DECLINED"] } }, include, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const dto = (q: (typeof incoming)[number]) => ({
    id: q.id,
    status: q.status,
    message: q.message,
    createdAt: q.createdAt,
    requestedByName: q.requestedBy.name,
    ownerName: q.reservation.owner.name,
    reservationId: q.reservationId,
    description: describe(q.reservation),
  });
  return { incoming: incoming.map(dto), outgoing: outgoing.map(dto) };
}

/** The owner accepts (the block is removed) or declines (with a note). */
export async function respondRemoval(id: string, accept: boolean, note: string | undefined, caller: ExamCaller) {
  const q = await prisma.examRemovalRequest.findUnique({ where: { id }, include: { reservation: { include: { room: { select: { name: true } }, subject: { select: { code: true } }, studentClass: { select: { name: true } } } } } });
  if (!q) throw notFound("Request not found");
  if (q.reservation.ownerId !== caller.id) throw forbidden("Only the owner of the block can answer this request.");
  if (q.status !== "PENDING") throw conflict("This request was already answered.");
  const text = describe(q.reservation);
  if (accept) {
    await prisma.examReservation.delete({ where: { id: q.reservationId } }); // the request goes with it
    void notifyUsers([q.requestedById], { type: "EXAM_ROOM", title: "Your request was accepted: the exam room block is free", body: `${text}, by ${caller.name}.`, link: "/exam-rooms", groupKey: `exam-answer-${id}` }, { exceptUserId: caller.id });
  } else {
    await prisma.examRemovalRequest.update({ where: { id }, data: { status: "DECLINED" } });
    void notifyUsers([q.requestedById], { type: "EXAM_ROOM", title: "Your request to free an exam room block was declined", body: `${text}, by ${caller.name}${note ? `: ${note}` : ""}.`, link: "/exam-rooms", groupKey: `exam-answer-${id}` }, { exceptUserId: caller.id });
  }
}

/** The chairman withdraws a request, or clears a declined one. */
export async function dismissRequest(id: string, caller: ExamCaller) {
  const q = await prisma.examRemovalRequest.findUnique({ where: { id } });
  if (!q) throw notFound("Request not found");
  if (q.requestedById !== caller.id) throw forbidden("Only the person who sent this request can withdraw it.");
  await prisma.examRemovalRequest.delete({ where: { id } });
}
