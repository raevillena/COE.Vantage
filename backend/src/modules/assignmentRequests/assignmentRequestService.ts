import { prisma } from "../../prisma/client.js";
import type { Prisma } from "@prisma/client";
import { badRequest, notFound, forbidden } from "../../utils/errors.js";
import type { CreateAssignmentRequestBody, ListAssignmentRequestsQuery, RespondAssignmentRequestBody } from "./assignmentRequestSchemas.js";

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
  if (!faculty || faculty.role !== "FACULTY") throw notFound("Faculty not found");
  if (!subject) throw notFound("Subject not found");
  if (!studentClass) throw notFound("Student class not found");
  if (!academicYear) throw notFound("Academic year not found");
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
      status: "PENDING",
    },
    include: {
      faculty: { select: { id: true, name: true } },
      subject: { select: { code: true, name: true } },
      studentClass: { select: { name: true } },
      requestedBy: { select: { name: true } },
    },
  });
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
        subject: { select: { id: true, code: true, name: true, units: true, isLab: true } },
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
      subject: { select: { id: true, code: true, name: true, units: true, isLab: true } },
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
  if (caller.role === "ADMIN" || caller.role === "DEAN") {
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
  if (caller.role !== "ADMIN" && caller.role !== "DEAN" && caller.role !== "CHAIRMAN") {
    throw forbidden("Not allowed to approve");
  }
  const load = await prisma.facultyLoad.create({
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
      subject: { select: { id: true, code: true, name: true, units: true, isLab: true } },
      studentClass: { select: { id: true, name: true, yearLevel: true, studentCount: true } },
      room: { select: { id: true, name: true, capacity: true, isLab: true } },
      academicYear: { select: { id: true, name: true } },
    },
  });
  await prisma.crossDepartmentLoadRequest.update({
    where: { id },
    data: { status: "APPROVED", respondedById: caller.id, respondedAt: new Date(), notes: body?.notes ?? undefined },
  });
  return { load, requestId: id };
}

export async function rejectRequest(id: string, caller: CallerContext, body?: RespondAssignmentRequestBody) {
  const request = await prisma.crossDepartmentLoadRequest.findUnique({
    where: { id },
    include: { faculty: { select: { departmentId: true } } },
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
  return { requestId: id };
}
