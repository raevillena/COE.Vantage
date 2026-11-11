import { prisma } from "../../prisma/client.js";
import type { Prisma } from "@prisma/client";
import { badRequest, notFound, forbidden } from "../../utils/errors.js";
import { isTeachingRole } from "../../utils/teachingRoles.js";
import { chairmenOf, notifyScheduleChange, notifyUsers } from "../notifications/notificationService.js";
import { assertTermUnlocked } from "../../utils/termLock.js";
import { checkConflicts } from "../facultyLoads/conflictService.js";
import type { UpdateAssignmentRequestBody, CreateAssignmentRequestBody, ListAssignmentRequestsQuery, RespondAssignmentRequestBody } from "./assignmentRequestSchemas.js";

export interface CallerContext {
  role: string;
  departmentId: string | null;
  id: string;
}

export async function createAssignmentRequest(body: CreateAssignmentRequestBody, requestedById: string) {
  const [faculty, subject, studentClass, academicYear] = await Promise.all([
    prisma.user.findUnique({ where: { id: body.facultyId }, select: { departmentId: true, role: true } }),
    prisma.subject.findUnique({ where: { id: body.subjectId } }),
    prisma.studentClass.findUnique({ where: { id: body.studentClassId }, include: { curriculum: { select: { departmentId: true } } } }),
    prisma.academicYear.findUnique({ where: { id: body.academicYearId } }),
  ]);
  if (!faculty || !isTeachingRole(faculty.role)) throw notFound("Faculty not found");
  if (!subject) throw notFound("Subject not found");
  if (!studentClass) throw notFound("Student class not found");
  if (!academicYear) throw notFound("Academic year not found");
  await assertTermUnlocked(body.academicYearId, body.semester);
  const subjectDeptId = subject.departmentId ?? studentClass.curriculum.departmentId ?? null;
  if (subjectDeptId === faculty.departmentId) {
    throw badRequest("Faculty is in the same department as the subject; use regular assignment.");
  }
  const request = await prisma.crossDepartmentLoadRequest.create({
    data: {
      requestedById,
      facultyId: body.facultyId,
      subjectId: body.subjectId,
      studentClassId: body.studentClassId,
      roomId: body.roomId ?? undefined,
      roomDisplayName: body.roomDisplayName ?? undefined,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      semester: body.semester,
      academicYearId: body.academicYearId,
      replacesLoadId: body.replacesLoadId ?? undefined,
      status: "PENDING",
    },
    include: {
      faculty: { select: { id: true, name: true } },
      subject: { select: { code: true, name: true } },
      studentClass: { select: { name: true } },
      requestedBy: { select: { name: true } },
    },
  });
  void notifyUsers(
    await chairmenOf(faculty.departmentId),
    {
      type: "REQUEST",
      title: (n) => (n === 1 ? "An assignment request needs your response" : `${n} assignment requests need your response`),
      body: `${request.requestedBy.name} asks for ${request.faculty.name}: ${request.subject.code} · ${request.studentClass.name}`,
      link: "/requests",
      groupKey: "request-new",
    },
    { exceptUserId: requestedById }
  );
  return request;
}

export async function listAssignmentRequests(query: ListAssignmentRequestsQuery, caller: CallerContext) {
  const forScheduleDisplay =
    query.studentClassId != null &&
    query.academicYearId != null &&
    query.semester != null;

  if (forScheduleDisplay) {
    const list = await prisma.crossDepartmentLoadRequest.findMany({
      where: {
        status: "PENDING",
        studentClassId: query.studentClassId!,
        academicYearId: query.academicYearId!,
        semester: Number(query.semester),
      },
      include: {
        faculty: { select: { id: true, name: true, email: true, department: { select: { name: true } } } },
        subject: { select: { id: true, code: true, name: true, units: true, isLab: true, lecUnits: true, labUnits: true } },
        studentClass: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true, department: { select: { name: true } } } },
        academicYear: { select: { id: true, name: true } },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return list;
  }

  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  // the Requests page shows one scheduling semester at a time
  if (query.academicYearId) where.academicYearId = query.academicYearId;
  if (query.semester) where.semester = Number(query.semester);

  const scope = query.scope ?? "all";

  if (scope === "mine") {
    where.requestedById = caller.id;
  } else if (scope === "other") {
    where.requestedById = { not: caller.id };
    if (caller.role === "CHAIRMAN" && caller.departmentId) {
      where.faculty = { departmentId: caller.departmentId };
    }
  } else {
    // all: chairman sees incoming to their dept + their own requests; admin/dean see everything
    if (caller.role === "CHAIRMAN" && caller.departmentId) {
      where.OR = [
        { faculty: { departmentId: caller.departmentId } },
        { requestedById: caller.id },
      ];
    }
  }

  const list = await prisma.crossDepartmentLoadRequest.findMany({
    where: where as Prisma.CrossDepartmentLoadRequestWhereInput,
    include: {
      faculty: { select: { id: true, name: true, email: true, department: { select: { name: true } } } },
      subject: { select: { id: true, code: true, name: true, units: true, isLab: true, lecUnits: true, labUnits: true } },
      studentClass: { select: { id: true, name: true } },
      room: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, name: true, department: { select: { name: true } } } },
      academicYear: { select: { id: true, name: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return list;
}

export async function getPendingCount(caller: CallerContext): Promise<number> {
  if (caller.role === "CHAIRMAN" && caller.departmentId) {
    return prisma.crossDepartmentLoadRequest.count({
      where: {
        status: "PENDING",
        faculty: { departmentId: caller.departmentId },
      },
    });
  }
  if (caller.role === "ADMIN" || caller.role === "DEAN" || caller.role === "COLLEGE_SECRETARY") {
    return prisma.crossDepartmentLoadRequest.count({
      where: { status: "PENDING" },
    });
  }
  return 0;
}

export async function approveRequest(id: string, caller: CallerContext, body?: RespondAssignmentRequestBody) {
  const request = await prisma.crossDepartmentLoadRequest.findUnique({
    where: { id },
    include: {
      faculty: { select: { departmentId: true } },
      subject: true,
      studentClass: true,
      room: true,
    },
  });
  if (!request) throw notFound("Request not found");
  if (request.status !== "PENDING") throw badRequest("Request is no longer pending");
  if (caller.role === "CHAIRMAN" && caller.departmentId !== request.faculty.departmentId) {
    throw forbidden("Only the faculty's department chairman can approve this request");
  }
  await assertTermUnlocked(request.academicYearId, request.semester, request.collegeId);
  if (caller.role !== "ADMIN" && caller.role !== "DEAN" && caller.role !== "CHAIRMAN") {
    throw forbidden("Not allowed to approve");
  }
  const load = await prisma.$transaction(async (tx) => {
    if (request.replacesLoadId) {
      await tx.facultyLoad.deleteMany({ where: { id: request.replacesLoadId } });
    }
    return tx.facultyLoad.create({
    data: {
      facultyId: request.facultyId,
      subjectId: request.subjectId,
      studentClassId: request.studentClassId,
      roomId: request.roomId ?? undefined,
      roomDisplayName: request.roomDisplayName ?? undefined,
      dayOfWeek: request.dayOfWeek,
      startTime: request.startTime,
      endTime: request.endTime,
      semester: request.semester,
      academicYearId: request.academicYearId,
    },
    include: {
      faculty: { select: { id: true, name: true, email: true } },
      subject: { select: { id: true, code: true, name: true, units: true, isLab: true, lecUnits: true, labUnits: true } },
      studentClass: { select: { id: true, name: true, yearLevel: true, studentCount: true } },
      room: { select: { id: true, name: true, capacity: true, isLab: true } },
      academicYear: { select: { id: true, name: true } },
    },
    });
  });
  await prisma.crossDepartmentLoadRequest.update({
    where: { id },
    data: { status: "APPROVED", respondedById: caller.id, respondedAt: new Date(), notes: body?.notes ?? undefined },
  });
  const what = `${request.subject.code} · ${request.studentClass.name}`;
  void notifyUsers([request.requestedById], { type: "REQUEST_RESULT", title: "Your assignment request was approved", body: `${what}${body?.notes ? `. ${body.notes}` : ""}`, link: "/requests" }, { exceptUserId: caller.id });
  void notifyScheduleChange(request.facultyId, "assigned", what, { exceptUserId: caller.id });
  return { load, requestId: id };
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** The chairman who asked changes the day, time or room of a request that still waits. */
export async function updateRequest(id: string, caller: CallerContext, body: UpdateAssignmentRequestBody) {
  const request = await prisma.crossDepartmentLoadRequest.findUnique({
    where: { id },
    include: { faculty: { select: { departmentId: true } }, subject: { select: { code: true } }, studentClass: { select: { name: true } } },
  });
  if (!request) throw notFound("Request not found");
  if (request.requestedById !== caller.id) throw forbidden("Only the chairman who made this request can edit it");
  if (request.status !== "PENDING") throw badRequest("Request is no longer pending");
  if (toMinutes(body.startTime) >= toMinutes(body.endTime)) throw badRequest("The end time must be after the start time.");
  await assertTermUnlocked(request.academicYearId, request.semester, request.collegeId);
  const roomId = body.roomId ?? null;
  const c = await checkConflicts({
    facultyId: request.facultyId,
    subjectId: request.subjectId,
    studentClassId: request.studentClassId,
    roomId: roomId ?? undefined,
    dayOfWeek: body.dayOfWeek,
    startTime: body.startTime,
    endTime: body.endTime,
    semester: request.semester,
    academicYearId: request.academicYearId,
    excludeLoadId: request.replacesLoadId ?? undefined,
  });
  if (c.roomConflict) throw badRequest("The room is already booked at that time.");
  if (c.facultyConflict) throw badRequest("The faculty member is already teaching at that time.");
  if (c.studentConflict) throw badRequest("The class already has a subject at that time.");
  const updated = await prisma.crossDepartmentLoadRequest.update({
    where: { id },
    data: { roomId, roomDisplayName: roomId ? null : body.roomDisplayName?.trim() || null, dayOfWeek: body.dayOfWeek, startTime: body.startTime, endTime: body.endTime },
  });
  void notifyUsers(await chairmenOf(request.faculty.departmentId), { type: "REQUEST", title: "An assignment request was changed", body: `${request.subject.code} · ${request.studentClass.name} has a new day, time or room`, link: "/requests", groupKey: `request-edit-${id}` }, { exceptUserId: caller.id });
  return updated;
}

/**
 * The block of another department's faculty was changed again while its first change still waits: the waiting request is
 * revised to the LATEST values (so there is one pending block, awaiting the latest approval) instead of a new request.
 */
export async function reviseReplacementRequest(
  id: string,
  caller: CallerContext,
  body: { facultyId: string; roomId: string | null; roomDisplayName: string | null; dayOfWeek: number; startTime: string; endTime: string }
) {
  const request = await prisma.crossDepartmentLoadRequest.findUnique({
    where: { id },
    include: { subject: { select: { code: true } }, studentClass: { select: { name: true } } },
  });
  if (!request) throw notFound("Request not found");
  if (request.requestedById !== caller.id) throw forbidden("Only the chairman who made this request can change it");
  if (request.status !== "PENDING") throw badRequest("Request is no longer pending");
  if (toMinutes(body.startTime) >= toMinutes(body.endTime)) throw badRequest("The end time must be after the start time.");
  await assertTermUnlocked(request.academicYearId, request.semester, request.collegeId);
  const roomDisplayName = body.roomId ? null : body.roomDisplayName?.trim() || null;
  const same =
    request.facultyId === body.facultyId &&
    (request.roomId ?? null) === body.roomId &&
    (request.roomDisplayName ?? null) === roomDisplayName &&
    request.dayOfWeek === body.dayOfWeek &&
    toMinutes(request.startTime) === toMinutes(body.startTime) &&
    toMinutes(request.endTime) === toMinutes(body.endTime);
  if (same) return request;
  const c = await checkConflicts({
    facultyId: body.facultyId,
    subjectId: request.subjectId,
    studentClassId: request.studentClassId,
    roomId: body.roomId ?? undefined,
    dayOfWeek: body.dayOfWeek,
    startTime: body.startTime,
    endTime: body.endTime,
    semester: request.semester,
    academicYearId: request.academicYearId,
    excludeLoadId: request.replacesLoadId ?? undefined,
  });
  if (c.roomConflict) throw badRequest("The room is already booked at that time.");
  if (c.facultyConflict) throw badRequest("The faculty member is already teaching at that time.");
  if (c.studentConflict) throw badRequest("The class already has a subject at that time.");
  const updated = await prisma.crossDepartmentLoadRequest.update({
    where: { id },
    data: { facultyId: body.facultyId, roomId: body.roomId, roomDisplayName, dayOfWeek: body.dayOfWeek, startTime: body.startTime, endTime: body.endTime },
  });
  const faculty = await prisma.user.findUnique({ where: { id: body.facultyId }, select: { departmentId: true } });
  void notifyUsers(
    await chairmenOf(faculty?.departmentId ?? null),
    { type: "REQUEST", title: "An assignment request was changed", body: `${request.subject.code} · ${request.studentClass.name} has a new person, day, time or room`, link: "/requests", groupKey: `request-edit-${id}` },
    { exceptUserId: caller.id }
  );
  return updated;
}

/** The chairman who asked takes a request back while it still waits. */
export async function cancelRequest(id: string, caller: CallerContext) {
  const request = await prisma.crossDepartmentLoadRequest.findUnique({
    where: { id },
    include: { faculty: { select: { departmentId: true } }, subject: { select: { code: true } }, studentClass: { select: { name: true } } },
  });
  if (!request) throw notFound("Request not found");
  if (request.requestedById !== caller.id) throw forbidden("Only the chairman who made this request can cancel it");
  if (request.status !== "PENDING") throw badRequest("Request is no longer pending");
  await prisma.crossDepartmentLoadRequest.update({ where: { id }, data: { status: "CANCELLED", respondedById: caller.id, respondedAt: new Date() } });
  void notifyUsers(await chairmenOf(request.faculty.departmentId), { type: "REQUEST", title: "An assignment request was cancelled", body: `${request.subject.code} · ${request.studentClass.name}`, link: "/requests" }, { exceptUserId: caller.id });
  return { requestId: id };
}

export async function rejectRequest(id: string, caller: CallerContext, body?: RespondAssignmentRequestBody) {
  const request = await prisma.crossDepartmentLoadRequest.findUnique({
    where: { id },
    include: { faculty: { select: { departmentId: true } }, subject: { select: { code: true } }, studentClass: { select: { name: true } } },
  });
  if (!request) throw notFound("Request not found");
  if (request.status !== "PENDING") throw badRequest("Request is no longer pending");
  if (caller.role === "CHAIRMAN" && caller.departmentId !== request.faculty.departmentId) {
    throw forbidden("Only the faculty's department chairman can reject this request");
  }
  if (caller.role !== "ADMIN" && caller.role !== "DEAN" && caller.role !== "CHAIRMAN") {
    throw forbidden("Not allowed to reject");
  }
  await prisma.crossDepartmentLoadRequest.update({
    where: { id },
    data: { status: "REJECTED", respondedById: caller.id, respondedAt: new Date(), notes: body?.notes ?? undefined },
  });
  void notifyUsers([request.requestedById], { type: "REQUEST_RESULT", title: "Your assignment request was rejected", body: `${request.subject.code} · ${request.studentClass.name}${body?.notes ? `. ${body.notes}` : ""}`, link: "/requests" }, { exceptUserId: caller.id });
  return { requestId: id };
}
