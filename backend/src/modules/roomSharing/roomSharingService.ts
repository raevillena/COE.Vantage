import { prisma } from "../../prisma/client.js";
import { badRequest, conflict, forbidden, notFound } from "../../utils/errors.js";
import { currentActor, runUnscoped, scopeCollegeId } from "../../utils/auditContext.js";
import { assertTermUnlocked } from "../../utils/termLock.js";
import { checkConflicts } from "../facultyLoads/conflictService.js";
import { notifyScheduleChange, notifyUsers } from "../notifications/notificationService.js";
import { audit } from "../audit/auditService.js";

/**
 * Room sharing between colleges.
 *
 * A college that has locked a semester opens the free time of its rooms to the other colleges. Chairmen of another
 * college draft blocks in those rooms; their college secretary collects the drafts into a request; the chairman of each
 * room's department approves; the college secretary of the room's college approves last, and the blocks become schedule
 * blocks of the asking college, booked into the other college's rooms. The host dean only views and is notified.
 *
 * These rows are read across colleges, so the service looks things up with `runUnscoped` and checks the colleges itself.
 */

export interface ShareCaller {
  id: string;
  name: string;
  role: string;
  departmentId: string | null;
  collegeId: string | null;
}

const PENDING = ["PENDING_CHAIRMAN", "PENDING_SECRETARY"];
const SEM = ["", "1st Sem", "2nd Sem", "Mid Year"];
const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Prisma queries run when awaited, so the call is awaited inside the unscoped context
const u = <T>(fn: () => PromiseLike<T>): Promise<T> => runUnscoped(async () => await fn());
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && aEnd > bStart;

export interface BlockInput {
  roomId: string;
  academicYearId: string;
  semester: number;
  studentClassId: string;
  subjectId: string;
  facultyId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

// ---------------------------------------------------------------- lookups

async function peopleOf(collegeId: string, roles: string[], departmentId?: string | null): Promise<string[]> {
  const rows = await u(() =>
    prisma.user.findMany({
      where: { collegeId, isDeleted: false, role: { in: roles as never[] }, ...(departmentId ? { departmentId } : {}) },
      select: { id: true },
    })
  );
  return rows.map((r) => r.id);
}

async function collegeNames(ids: string[]): Promise<Map<string, string>> {
  const rows = await u(() => prisma.college.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } }));
  return new Map(rows.map((r) => [r.id, r.name]));
}

interface RawBlock {
  id: string;
  requestId: string | null;
  guestCollegeId: string;
  hostCollegeId: string;
  roomId: string;
  academicYearId: string;
  semester: number;
  studentClassId: string;
  subjectId: string;
  facultyId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  createdById: string;
  createdByName: string;
  createdAt: Date;
}

/** Adds the names a person needs to read a block: room, class, subject, faculty. */
async function enrich(blocks: RawBlock[]) {
  const ids = (pick: (b: RawBlock) => string | null) => [...new Set(blocks.map(pick).filter((x): x is string => Boolean(x)))];
  const [rooms, classes, subjects, faculty] = await Promise.all([
    u(() => prisma.room.findMany({ where: { id: { in: ids((b) => b.roomId) } }, select: { id: true, name: true, capacity: true, isLab: true, departmentId: true, department: { select: { name: true } } } })),
    u(() => prisma.studentClass.findMany({ where: { id: { in: ids((b) => b.studentClassId) } }, select: { id: true, name: true } })),
    u(() => prisma.subject.findMany({ where: { id: { in: ids((b) => b.subjectId) } }, select: { id: true, code: true, name: true } })),
    u(() => prisma.user.findMany({ where: { id: { in: ids((b) => b.facultyId) } }, select: { id: true, name: true } })),
  ]);
  const r = new Map(rooms.map((x) => [x.id, x]));
  const c = new Map(classes.map((x) => [x.id, x]));
  const s = new Map(subjects.map((x) => [x.id, x]));
  const f = new Map(faculty.map((x) => [x.id, x]));
  return blocks.map((b) => ({
    ...b,
    roomName: r.get(b.roomId)?.name ?? "A room",
    roomDepartmentId: r.get(b.roomId)?.departmentId ?? null,
    roomDepartmentName: r.get(b.roomId)?.department?.name ?? null,
    className: c.get(b.studentClassId)?.name ?? "",
    subjectCode: s.get(b.subjectId)?.code ?? "",
    subjectName: s.get(b.subjectId)?.name ?? "",
    facultyName: b.facultyId ? f.get(b.facultyId)?.name ?? null : null,
  }));
}

const blockLabel = (b: { subjectCode?: string; className?: string; roomName?: string; dayOfWeek: number; startTime: string; endTime: string }) =>
  `${b.subjectCode} · ${b.className} in ${b.roomName}, ${DAY[b.dayOfWeek]} ${b.startTime}-${b.endTime}`;

// ---------------------------------------------------------------- rooms other colleges may ask for

async function busyOf(roomIds: string[], academicYearId: string, semester: number) {
  const [loads, held] = await Promise.all([
    u(() => prisma.facultyLoad.findMany({ where: { roomId: { in: roomIds }, academicYearId, semester }, select: { roomId: true, dayOfWeek: true, startTime: true, endTime: true } })),
    u(() =>
      prisma.roomShareBlock.findMany({
        where: { roomId: { in: roomIds }, academicYearId, semester, request: { status: { in: PENDING } } },
        select: { roomId: true, dayOfWeek: true, startTime: true, endTime: true },
      })
    ),
  ]);
  const map = new Map<string, { dayOfWeek: number; startTime: string; endTime: string; held: boolean }[]>();
  for (const l of loads) map.set(l.roomId!, [...(map.get(l.roomId!) ?? []), { dayOfWeek: l.dayOfWeek, startTime: l.startTime, endTime: l.endTime, held: false }]);
  for (const l of held) map.set(l.roomId, [...(map.get(l.roomId) ?? []), { dayOfWeek: l.dayOfWeek, startTime: l.startTime, endTime: l.endTime, held: true }]);
  return map;
}

/** Rooms of the colleges that locked this semester, with what is already booked, for another college to ask for. */
export async function listShareableRooms(caller: ShareCaller, q: { academicYearId: string; semester: number; minCapacity?: number; isLab?: boolean }) {
  const own = caller.collegeId;
  const locks = await u(() =>
    prisma.termLock.findMany({ where: { academicYearId: q.academicYearId, semester: q.semester, ...(own ? { collegeId: { not: own } } : {}) }, select: { collegeId: true } })
  );
  const hostIds = locks.map((l) => l.collegeId).filter((x): x is string => Boolean(x));
  if (hostIds.length === 0) return [];
  const [rooms, names] = await Promise.all([
    u(() =>
      prisma.room.findMany({
        where: {
          collegeId: { in: hostIds },
          isDeleted: false,
          ...(q.minCapacity ? { capacity: { gte: q.minCapacity } } : {}),
          ...(q.isLab !== undefined ? { isLab: q.isLab } : {}),
        },
        include: { department: { select: { name: true } } },
        orderBy: [{ collegeId: "asc" }, { name: "asc" }],
      })
    ),
    collegeNames(hostIds),
  ]);
  const busy = await busyOf(rooms.map((r) => r.id), q.academicYearId, q.semester);
  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    isLab: r.isLab,
    hasComputer: r.hasComputer,
    hasAC: r.hasAC,
    collegeId: r.collegeId,
    collegeName: names.get(r.collegeId ?? "") ?? "",
    departmentId: r.departmentId,
    departmentName: r.department?.name ?? "",
    busy: busy.get(r.id) ?? [],
  }));
}

// ---------------------------------------------------------------- drafts

/** Everything wrong with a proposed block, or an empty list. `ignore` are drafts not to count (the ones being submitted together). */
async function problemsOf(caller: ShareCaller, b: BlockInput, opts: { ignoreBlockIds?: string[]; forRequest?: boolean } = {}): Promise<string[]> {
  const problems: string[] = [];
  if (b.startTime >= b.endTime) return ["The end time must be after the start time."];
  const room = await u(() => prisma.room.findUnique({ where: { id: b.roomId } }));
  if (!room || room.isDeleted || !room.collegeId) return ["That room was not found."];
  if (room.collegeId === caller.collegeId) return ["That room belongs to your own college. Schedule it from the Scheduler."];
  const lock = await u(() => prisma.termLock.findFirst({ where: { collegeId: room.collegeId!, academicYearId: b.academicYearId, semester: b.semester } }));
  if (!lock) return ["The college that owns this room has not locked this semester, so its rooms are not open yet."];

  // the asking college's own semester must still be open for changes
  try {
    await u(() => assertTermUnlocked(b.academicYearId, b.semester, caller.collegeId));
  } catch (e) {
    return [e instanceof Error ? e.message : "Your college's semester is locked."];
  }

  const c = await u(() =>
    checkConflicts({
      facultyId: b.facultyId ?? undefined,
      subjectId: b.subjectId,
      studentClassId: b.studentClassId,
      roomId: b.roomId,
      dayOfWeek: b.dayOfWeek,
      startTime: b.startTime,
      endTime: b.endTime,
      semester: b.semester,
      academicYearId: b.academicYearId,
    })
  );
  if (c.roomConflict) problems.push("The room is already booked at that time.");
  if (c.facultyConflict) problems.push("The faculty member is already teaching at that time.");
  if (c.studentConflict) problems.push("The class already has a subject at that time.");
  if (c.capacityIssue) problems.push("The room is too small for the class.");
  if (c.labRoomMismatch) problems.push("This subject needs a laboratory room.");

  // blocks held by other pending requests
  const held = await u(() =>
    prisma.roomShareBlock.findMany({
      where: {
        academicYearId: b.academicYearId,
        semester: b.semester,
        dayOfWeek: b.dayOfWeek,
        AND: [{ OR: [{ request: { status: { in: PENDING } } }, { requestId: null, guestCollegeId: caller.collegeId! }] }],
        id: { notIn: opts.ignoreBlockIds ?? [] },
        OR: [{ roomId: b.roomId }, { studentClassId: b.studentClassId }, ...(b.facultyId ? [{ facultyId: b.facultyId }] : [])],
      },
    })
  );
  for (const h of held) {
    if (!overlaps(h.startTime, h.endTime, b.startTime, b.endTime)) continue;
    if (h.roomId === b.roomId) problems.push("The room is held by another draft or request.");
    else if (h.studentClassId === b.studentClassId) problems.push("The class has another draft or request at that time.");
    else problems.push("The faculty member has another draft or request at that time.");
  }
  return [...new Set(problems)];
}

async function assertCanDraft(caller: ShareCaller, b: BlockInput) {
  if (caller.role !== "CHAIRMAN" || !caller.collegeId) throw forbidden("Only a chairman drafts room requests.");
  const cls = await prisma.studentClass.findUnique({ where: { id: b.studentClassId }, include: { curriculum: { select: { departmentId: true } } } });
  if (!cls) throw notFound("Student class not found");
  if (caller.departmentId && cls.curriculum.departmentId !== caller.departmentId) throw forbidden("You can only draft for classes in your department's curricula.");
  const subject = await prisma.subject.findUnique({ where: { id: b.subjectId } });
  if (!subject) throw notFound("Subject not found");
  if (b.facultyId) {
    const f = await prisma.user.findUnique({ where: { id: b.facultyId } });
    if (!f) throw notFound("Faculty not found");
  }
}

export async function previewDraft(caller: ShareCaller, b: BlockInput) {
  await assertCanDraft(caller, b);
  const problems = await problemsOf(caller, b);
  return { ok: problems.length === 0, problems };
}

export async function createDraft(caller: ShareCaller, b: BlockInput) {
  await assertCanDraft(caller, b);
  const problems = await problemsOf(caller, b);
  if (problems.length > 0) throw conflict(problems.join(" "));
  const room = await u(() => prisma.room.findUniqueOrThrow({ where: { id: b.roomId } }));
  const row = await u(() =>
    prisma.roomShareBlock.create({
      data: {
        guestCollegeId: caller.collegeId!,
        hostCollegeId: room.collegeId!,
        roomId: b.roomId,
        academicYearId: b.academicYearId,
        semester: b.semester,
        studentClassId: b.studentClassId,
        subjectId: b.subjectId,
        facultyId: b.facultyId ?? null,
        dayOfWeek: b.dayOfWeek,
        startTime: b.startTime,
        endTime: b.endTime,
        createdById: caller.id,
        createdByName: caller.name,
      },
    })
  );
  return (await enrich([row]))[0];
}

export async function listDrafts(caller: ShareCaller) {
  if (!caller.collegeId) return [];
  const rows = await u(() =>
    prisma.roomShareBlock.findMany({
      where: { guestCollegeId: caller.collegeId!, requestId: null, ...(caller.role === "CHAIRMAN" ? { createdById: caller.id } : {}) },
      orderBy: [{ academicYearId: "asc" }, { semester: "asc" }, { hostCollegeId: "asc" }, { roomId: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
    })
  );
  const [blocks, names] = await Promise.all([enrich(rows), collegeNames(rows.map((r) => r.hostCollegeId))]);
  return blocks.map((b) => ({ ...b, hostCollegeName: names.get(b.hostCollegeId) ?? "" }));
}

export async function deleteDraft(caller: ShareCaller, id: string) {
  const b = await u(() => prisma.roomShareBlock.findUnique({ where: { id } }));
  if (!b || b.requestId || b.guestCollegeId !== caller.collegeId) throw notFound("Draft not found");
  if (!(b.createdById === caller.id || caller.role === "COLLEGE_SECRETARY")) throw forbidden("Only the chairman who drafted it, or your college secretary, can remove it.");
  await u(() => prisma.roomShareBlock.delete({ where: { id } }));
}

// ---------------------------------------------------------------- requests

/** Submits drafts as requests, one per college whose rooms they use. Only the college secretary submits. */
export async function submitRequests(caller: ShareCaller, body: { draftIds: string[]; note?: string | null }) {
  if (caller.role !== "COLLEGE_SECRETARY" || !caller.collegeId) throw forbidden("Only the college secretary submits room requests.");
  const drafts = await u(() => prisma.roomShareBlock.findMany({ where: { id: { in: body.draftIds }, requestId: null, guestCollegeId: caller.collegeId! } }));
  if (drafts.length === 0 || drafts.length !== new Set(body.draftIds).size) throw badRequest("Choose drafts of your college that have not been submitted yet.");

  // blocks of one request must not clash with each other, and each must still be possible today
  const ids = drafts.map((d) => d.id);
  for (let i = 0; i < drafts.length; i++) {
    for (let j = i + 1; j < drafts.length; j++) {
      const a = drafts[i];
      const b = drafts[j];
      if (a.academicYearId !== b.academicYearId || a.semester !== b.semester || a.dayOfWeek !== b.dayOfWeek || !overlaps(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
      if (a.roomId === b.roomId || a.studentClassId === b.studentClassId || (a.facultyId && a.facultyId === b.facultyId)) {
        throw conflict("Two of the chosen drafts clash with each other (same room, class or faculty at the same time). Remove one.");
      }
    }
  }
  for (const d of drafts) {
    const problems = await problemsOf(caller, d, { ignoreBlockIds: ids });
    if (problems.length) {
      const [e] = await enrich([d]);
      throw conflict(`${blockLabel(e)} can no longer be requested: ${problems.join(" ")}`);
    }
  }

  const groups = new Map<string, typeof drafts>();
  for (const d of drafts) groups.set(`${d.hostCollegeId}|${d.academicYearId}|${d.semester}`, [...(groups.get(`${d.hostCollegeId}|${d.academicYearId}|${d.semester}`) ?? []), d]);

  const created: { id: string; hostCollegeId: string; count: number }[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    const rooms = await u(() => prisma.room.findMany({ where: { id: { in: [...new Set(group.map((g) => g.roomId))] } }, select: { id: true, departmentId: true, department: { select: { name: true } } } }));
    const departments = new Map(rooms.map((r) => [r.departmentId, r.department?.name ?? "Department"]));
    const request = await u(() =>
      prisma.$transaction(async (tx) => {
        const req = await tx.roomShareRequest.create({
          data: {
            guestCollegeId: caller.collegeId!,
            hostCollegeId: first.hostCollegeId,
            academicYearId: first.academicYearId,
            semester: first.semester,
            note: body.note?.trim() || null,
            submittedById: caller.id,
            submittedByName: caller.name,
            approvals: { create: [...departments].map(([departmentId, departmentName]) => ({ departmentId, departmentName })) },
          },
        });
        await tx.roomShareBlock.updateMany({ where: { id: { in: group.map((g) => g.id) } }, data: { requestId: req.id } });
        return req;
      })
    );
    created.push({ id: request.id, hostCollegeId: first.hostCollegeId, count: group.length });

    const names = await collegeNames([caller.collegeId!, first.hostCollegeId]);
    const guestName = names.get(caller.collegeId!) ?? "A college";
    const year = await u(() => prisma.academicYear.findUnique({ where: { id: first.academicYearId }, select: { name: true } }));
    const term = `${year?.name ?? ""}, ${SEM[first.semester]}`;
    const what = `${group.length} ${group.length === 1 ? "block" : "blocks"} for ${term}`;
    for (const [departmentId] of departments) {
      void notifyUsers(await peopleOf(first.hostCollegeId, ["CHAIRMAN"], departmentId), {
        type: "ROOM_SHARE",
        title: "A room request needs your approval",
        body: `${guestName} asks for ${what} in your department's rooms.`,
        link: "/room-sharing",
        groupKey: `room-share-${request.id}`,
      });
    }
    void notifyUsers(await peopleOf(first.hostCollegeId, ["COLLEGE_SECRETARY", "DEAN"]), {
      type: "ROOM_SHARE",
      title: "A room request was submitted for your rooms",
      body: `${guestName}: ${what}. The chairmen approve first, then the college secretary.`,
      link: "/room-sharing",
      groupKey: `room-share-${request.id}-host`,
    });
    void notifyUsers(await peopleOf(caller.collegeId!, ["DEAN"]), {
      type: "ROOM_SHARE",
      title: "Your college submitted a room request",
      body: `${what} in ${names.get(first.hostCollegeId) ?? "another college"}.`,
      link: "/room-sharing",
      groupKey: `room-share-${request.id}-guest`,
    }, { exceptUserId: caller.id });
    await audit({
      entityType: "ROOM_SHARE",
      entityId: request.id,
      entityLabel: `${guestName} → ${names.get(first.hostCollegeId) ?? ""}`,
      action: "CREATE",
      summary: `Submitted a room request to ${names.get(first.hostCollegeId) ?? "another college"}: ${what}`,
      academicYearId: first.academicYearId,
      semester: first.semester,
      collegeId: caller.collegeId,
    });
  }
  return created;
}

async function viewScope(): Promise<string[] | null> {
  // the admin, president and unit viewers: the viewed college, else the colleges they may see, else everything
  const actor = currentActor();
  const one = scopeCollegeId(actor);
  if (one) return [one];
  return actor?.allowedCollegeIds ?? null;
}

export async function listRequests(caller: ShareCaller, side: "guest" | "host") {
  let where: Record<string, unknown>;
  if (caller.collegeId) {
    where = side === "guest" ? { guestCollegeId: caller.collegeId } : { hostCollegeId: caller.collegeId };
    // a chairman handles only the requests that use a room of their department
    if (side === "host" && caller.role === "CHAIRMAN") where = { ...where, approvals: { some: { departmentId: caller.departmentId ?? "none" } } };
  } else {
    const scope = await viewScope();
    where = scope ? { [side === "guest" ? "guestCollegeId" : "hostCollegeId"]: { in: scope } } : {};
  }
  const rows = await u(() =>
    prisma.roomShareRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { approvals: true, _count: { select: { blocks: true } } } })
  );
  const [names, years] = await Promise.all([
    collegeNames(rows.flatMap((r) => [r.guestCollegeId, r.hostCollegeId])),
    u(() => prisma.academicYear.findMany({ where: { id: { in: rows.map((r) => r.academicYearId) } }, select: { id: true, name: true } })),
  ]);
  const ym = new Map(years.map((y) => [y.id, y.name]));
  return rows.map(({ _count, ...r }) => ({
    ...r,
    guestCollegeName: names.get(r.guestCollegeId) ?? "",
    hostCollegeName: names.get(r.hostCollegeId) ?? "",
    academicYearName: ym.get(r.academicYearId) ?? "",
    blockCount: _count.blocks,
  }));
}

async function loadRequest(caller: ShareCaller, id: string) {
  const request = await u(() => prisma.roomShareRequest.findUnique({ where: { id }, include: { approvals: true, blocks: { orderBy: [{ roomId: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }] } } }));
  if (!request) throw notFound("Room request not found");
  if (caller.collegeId) {
    const guest = request.guestCollegeId === caller.collegeId;
    const host = request.hostCollegeId === caller.collegeId;
    const chairmanOk = caller.role !== "CHAIRMAN" || !host || guest || request.approvals.some((a) => a.departmentId === caller.departmentId);
    if (!(guest || host) || !chairmanOk) throw notFound("Room request not found");
  } else {
    const scope = await viewScope();
    if (scope && !scope.includes(request.guestCollegeId) && !scope.includes(request.hostCollegeId)) throw notFound("Room request not found");
  }
  return request;
}

/** What this person may do with a request right now. */
function actionsFor(caller: ShareCaller, r: { status: string; hostCollegeId: string; guestCollegeId: string; approvals: { departmentId: string; status: string }[] }) {
  const host = caller.collegeId === r.hostCollegeId;
  const guest = caller.collegeId === r.guestCollegeId;
  return {
    chairmanDecides: host && caller.role === "CHAIRMAN" && r.status === "PENDING_CHAIRMAN" && r.approvals.some((a) => a.departmentId === caller.departmentId && a.status === "PENDING"),
    secretaryDecides: host && caller.role === "COLLEGE_SECRETARY" && r.status === "PENDING_SECRETARY",
    canCancel: guest && caller.role === "COLLEGE_SECRETARY" && PENDING.includes(r.status),
  };
}

export async function getRequest(caller: ShareCaller, id: string) {
  const request = await loadRequest(caller, id);
  const { blocks, ...rest } = request;
  const [rich, names, year] = await Promise.all([
    enrich(blocks),
    collegeNames([request.guestCollegeId, request.hostCollegeId]),
    u(() => prisma.academicYear.findUnique({ where: { id: request.academicYearId }, select: { name: true } })),
  ]);
  return {
    ...rest,
    guestCollegeName: names.get(request.guestCollegeId) ?? "",
    hostCollegeName: names.get(request.hostCollegeId) ?? "",
    academicYearName: year?.name ?? "",
    blocks: rich,
    actions: actionsFor(caller, request),
  };
}

export async function decide(caller: ShareCaller, id: string, kind: "approve" | "reject", notes?: string | null) {
  const request = await loadRequest(caller, id);
  const a = actionsFor(caller, request);
  const names = await collegeNames([request.guestCollegeId, request.hostCollegeId]);
  const guestName = names.get(request.guestCollegeId) ?? "A college";
  const hostName = names.get(request.hostCollegeId) ?? "";
  const cleanNotes = notes?.trim() || null;
  const year = await u(() => prisma.academicYear.findUnique({ where: { id: request.academicYearId }, select: { name: true } }));
  const term = `${year?.name ?? ""}, ${SEM[request.semester]}`;
  const blocksN = request.blocks.length;

  const tellGuest = async (title: string, body: string) => {
    const people = [
      ...(await peopleOf(request.guestCollegeId, ["COLLEGE_SECRETARY", "DEAN"])),
      ...request.blocks.map((b) => b.createdById),
    ];
    void notifyUsers(people, { type: "ROOM_SHARE", title, body, link: "/room-sharing" }, { exceptUserId: caller.id });
  };

  if (kind === "reject") {
    if (!a.chairmanDecides && !a.secretaryDecides) throw forbidden("This request is not waiting for your decision.");
    await u(() =>
      prisma.$transaction(async (tx) => {
        if (a.chairmanDecides) await tx.roomShareApproval.update({ where: { requestId_departmentId: { requestId: id, departmentId: caller.departmentId! } }, data: { status: "REJECTED", decidedById: caller.id, decidedByName: caller.name, decidedAt: new Date(), notes: cleanNotes } });
        await tx.roomShareRequest.update({ where: { id }, data: { status: "REJECTED", decidedById: caller.id, decidedByName: caller.name, decidedAt: new Date(), decisionNotes: cleanNotes } });
      })
    );
    await tellGuest("Your room request was rejected", `${hostName}, ${term}: ${blocksN} ${blocksN === 1 ? "block" : "blocks"}.${cleanNotes ? ` ${cleanNotes}` : ""}`);
    void notifyUsers(await peopleOf(request.hostCollegeId, ["DEAN"]), { type: "ROOM_SHARE", title: "A room request was rejected", body: `${guestName}, ${term}.`, link: "/room-sharing" }, { exceptUserId: caller.id });
    await audit({ entityType: "ROOM_SHARE", entityId: id, entityLabel: `${guestName} → ${hostName}`, action: "UPDATE", summary: `Rejected the room request of ${guestName} (${term})${cleanNotes ? `: ${cleanNotes}` : ""}`, academicYearId: request.academicYearId, semester: request.semester, collegeId: request.hostCollegeId });
    return getRequest(caller, id);
  }

  // approve
  if (a.chairmanDecides) {
    const state = await u(() =>
      prisma.$transaction(async (tx) => {
        await tx.roomShareApproval.update({ where: { requestId_departmentId: { requestId: id, departmentId: caller.departmentId! } }, data: { status: "APPROVED", decidedById: caller.id, decidedByName: caller.name, decidedAt: new Date(), notes: cleanNotes } });
        const left = await tx.roomShareApproval.count({ where: { requestId: id, status: { not: "APPROVED" } } });
        if (left === 0) await tx.roomShareRequest.update({ where: { id }, data: { status: "PENDING_SECRETARY" } });
        return left === 0 ? "chairmen-done" : "waiting";
      })
    );
    if (state === "chairmen-done") {
      void notifyUsers(await peopleOf(request.hostCollegeId, ["COLLEGE_SECRETARY"]), { type: "ROOM_SHARE", title: "A room request is ready for your final approval", body: `${guestName}: ${blocksN} ${blocksN === 1 ? "block" : "blocks"} for ${term}. The chairmen approved.`, link: "/room-sharing" });
      void notifyUsers(await peopleOf(request.hostCollegeId, ["DEAN"]), { type: "ROOM_SHARE", title: "The chairmen approved a room request", body: `${guestName}, ${term}. It waits for the college secretary.`, link: "/room-sharing" });
    }
    await audit({ entityType: "ROOM_SHARE", entityId: id, entityLabel: `${guestName} → ${hostName}`, action: "UPDATE", summary: `Chairman approved the room request of ${guestName} (${term})`, academicYearId: request.academicYearId, semester: request.semester, collegeId: request.hostCollegeId });
    return getRequest(caller, id);
  }
  if (!a.secretaryDecides) throw forbidden("This request is not waiting for your decision.");

  // final approval: the blocks become schedule blocks of the asking college, in the host college's rooms
  const lock = await u(() => prisma.termLock.findFirst({ where: { collegeId: request.hostCollegeId, academicYearId: request.academicYearId, semester: request.semester } }));
  if (!lock) throw badRequest("Your college has not locked this semester, so its rooms cannot be given out.");
  await u(() => assertTermUnlocked(request.academicYearId, request.semester, request.guestCollegeId));
  const loads = await u(() =>
    prisma.$transaction(async (tx) => {
      const out: { id: string; facultyId: string | null }[] = [];
      for (const b of request.blocks) {
        const c = await checkConflicts(
          {
            facultyId: b.facultyId ?? undefined,
            subjectId: b.subjectId,
            studentClassId: b.studentClassId,
            roomId: b.roomId,
            dayOfWeek: b.dayOfWeek,
            startTime: b.startTime,
            endTime: b.endTime,
            semester: b.semester,
            academicYearId: b.academicYearId,
          },
          tx
        );
        if (c.roomConflict || c.facultyConflict || c.studentConflict) {
          const [e] = await enrich([b]);
          throw conflict(`${blockLabel(e)} now clashes with another block (${[c.roomConflict && "room", c.facultyConflict && "faculty", c.studentConflict && "class"].filter(Boolean).join(", ")}). Reject the request and ask for a new one.`);
        }
        const load = await tx.facultyLoad.create({
          data: {
            collegeId: request.guestCollegeId,
            hostCollegeId: request.hostCollegeId,
            facultyId: b.facultyId,
            subjectId: b.subjectId,
            studentClassId: b.studentClassId,
            roomId: b.roomId,
            dayOfWeek: b.dayOfWeek,
            startTime: b.startTime,
            endTime: b.endTime,
            semester: b.semester,
            academicYearId: b.academicYearId,
          },
          select: { id: true, facultyId: true },
        });
        out.push(load);
      }
      await tx.roomShareRequest.update({ where: { id }, data: { status: "APPROVED", decidedById: caller.id, decidedByName: caller.name, decidedAt: new Date(), decisionNotes: cleanNotes } });
      return out;
    })
  );
  await tellGuest("Your room request was approved", `${hostName}, ${term}: ${blocksN} ${blocksN === 1 ? "block is" : "blocks are"} now in your schedule.${cleanNotes ? ` ${cleanNotes}` : ""}`);
  void notifyUsers(await peopleOf(request.hostCollegeId, ["DEAN"]), { type: "ROOM_SHARE", title: "A room request was approved", body: `${guestName} now uses your rooms: ${blocksN} ${blocksN === 1 ? "block" : "blocks"}, ${term}.`, link: "/room-sharing" }, { exceptUserId: caller.id });
  const perFaculty = new Map<string, number>();
  for (const l of loads) if (l.facultyId) perFaculty.set(l.facultyId, (perFaculty.get(l.facultyId) ?? 0) + 1);
  for (const [facultyId, n] of perFaculty) void notifyScheduleChange(facultyId, "assigned", `${n} ${n === 1 ? "block" : "blocks"} in ${hostName}'s rooms`, { increment: n, exceptUserId: caller.id });
  await audit({ entityType: "ROOM_SHARE", entityId: id, entityLabel: `${guestName} → ${hostName}`, action: "UPDATE", summary: `Approved the room request of ${guestName} (${term}): ${blocksN} ${blocksN === 1 ? "block" : "blocks"} booked`, academicYearId: request.academicYearId, semester: request.semester, collegeId: request.hostCollegeId });
  return getRequest(caller, id);
}

export async function cancelRequest(caller: ShareCaller, id: string) {
  const request = await loadRequest(caller, id);
  if (!actionsFor(caller, request).canCancel) throw forbidden("Only your college secretary can cancel a request that is still waiting.");
  await u(() =>
    prisma.$transaction(async (tx) => {
      await tx.roomShareRequest.update({ where: { id }, data: { status: "CANCELLED", decidedById: caller.id, decidedByName: caller.name, decidedAt: new Date() } });
      // the blocks go back to being drafts, so nothing has to be typed again
      await tx.roomShareBlock.updateMany({ where: { requestId: id }, data: { requestId: null } });
    })
  );
  const names = await collegeNames([request.guestCollegeId, request.hostCollegeId]);
  void notifyUsers(await peopleOf(request.hostCollegeId, ["COLLEGE_SECRETARY", "DEAN"]), { type: "ROOM_SHARE", title: "A room request was cancelled", body: `${names.get(request.guestCollegeId) ?? "A college"} withdrew its request.`, link: "/room-sharing" });
  await audit({ entityType: "ROOM_SHARE", entityId: id, entityLabel: `${names.get(request.guestCollegeId)} → ${names.get(request.hostCollegeId)}`, action: "UPDATE", summary: "Cancelled a room request", academicYearId: request.academicYearId, semester: request.semester, collegeId: request.guestCollegeId });
}

// ---------------------------------------------------------------- unlocking

/** A college cannot unlock a semester while other colleges still have blocks, or requests waiting, in its rooms. */
export async function assertNoGuestBookings(hostCollegeId: string, academicYearId: string, semester: number): Promise<void> {
  const [blocks, pending] = await Promise.all([
    u(() => prisma.facultyLoad.count({ where: { hostCollegeId, academicYearId, semester } })),
    u(() => prisma.roomShareRequest.count({ where: { hostCollegeId, academicYearId, semester, status: { in: PENDING } } })),
  ]);
  if (blocks > 0) throw badRequest(`Other colleges have ${blocks} ${blocks === 1 ? "block" : "blocks"} booked in your rooms this semester. They must be removed before you can unlock it.`);
  if (pending > 0) throw badRequest("Other colleges have room requests waiting for this semester. Reject or finish them before you unlock it.");
}
