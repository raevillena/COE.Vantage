import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";
import * as facultyLoadService from "./facultyLoadService.js";
import { isTeachingRole } from "../../utils/teachingRoles.js";
import * as assignmentRequestService from "../assignmentRequests/assignmentRequestService.js";
import type {
  CreateFacultyLoadBody,
  UpdateFacultyLoadBody,
  PreviewFacultyLoadBody,
  AutoAssignFacultyLoadBody,
  ResetFacultyLoadBody,
  SlotAvailabilityQuery,
} from "./facultyLoadSchemas.js";
import { notifyScheduleChange } from "../notifications/notificationService.js";
import type { CopyFromPreviousFacultyLoadBody } from "./facultyLoadSchemas.js";

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as facultyLoadService.ListFacultyLoadsQuery;
  if (query.semester !== undefined) query.semester = Number(query.semester);
  const list = await facultyLoadService.listFacultyLoads(query);
  res.json(list);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const load = await facultyLoadService.getFacultyLoadById(req.params.id);
  res.json(load);
}

export async function preview(req: Request, res: Response): Promise<void> {
  const body = req.body as PreviewFacultyLoadBody;
  const result = await facultyLoadService.previewFacultyLoad(body);
  res.json(result);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateFacultyLoadBody;
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : undefined;
  const effectiveFacultyId = body.facultyId?.trim() || null;
  if (req.user?.role === "CHAIRMAN" && effectiveFacultyId) {
    const [subject, studentClass, faculty] = await Promise.all([
      prisma.subject.findUnique({ where: { id: body.subjectId }, select: { departmentId: true } }),
      prisma.studentClass.findUnique({
        where: { id: body.studentClassId },
        include: { curriculum: { select: { departmentId: true } } },
      }),
      prisma.user.findUnique({ where: { id: effectiveFacultyId }, select: { departmentId: true, role: true } }),
    ]);
    const subjectDeptId = subject?.departmentId ?? studentClass?.curriculum?.departmentId ?? null;
    const facultyDeptId = faculty?.departmentId ?? null;

    const needsApproval = isTeachingRole(faculty?.role ?? "");
    if (subjectDeptId != null && facultyDeptId != null && subjectDeptId !== facultyDeptId && needsApproval) {
      if (body.roomId && caller) await facultyLoadService.assertRoomAssignable(body.roomId, body.academicYearId, body.semester, caller);
      const request = await assignmentRequestService.createAssignmentRequest(
        {
          facultyId: effectiveFacultyId,
          subjectId: body.subjectId,
          studentClassId: body.studentClassId,
          roomId: body.roomId ?? null,
          roomDisplayName: body.roomDisplayName ?? null,
          dayOfWeek: body.dayOfWeek,
          startTime: body.startTime,
          endTime: body.endTime,
          semester: body.semester,
          academicYearId: body.academicYearId,
        },
        req.user.id
      );
      res.status(201).json({ requestCreated: true, request });
      return;
    }
  }
  const load = await facultyLoadService.createFacultyLoad(body, caller);
  void notifyScheduleChange(load.facultyId, "assigned", `${load.subject.code} · ${load.studentClass.name}`, { exceptUserId: req.user?.id });
  res.status(201).json(load);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateFacultyLoadBody;
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : undefined;
  const newFacultyId = body.facultyId?.trim() || null;
  if (req.user?.role === "CHAIRMAN" && newFacultyId) {
    const existing = await prisma.facultyLoad.findUnique({
      where: { id: req.params.id },
      include: { subject: { select: { departmentId: true } }, studentClass: { include: { curriculum: { select: { departmentId: true } } } } },
    });
    if (existing && existing.facultyId !== newFacultyId) {
      const faculty = await prisma.user.findUnique({ where: { id: newFacultyId }, select: { departmentId: true, role: true } });
      const subjectDeptId = existing.subject?.departmentId ?? existing.studentClass?.curriculum?.departmentId ?? null;
      const facultyDeptId = faculty?.departmentId ?? null;
      if (subjectDeptId != null && facultyDeptId != null && subjectDeptId !== facultyDeptId) {
        const roomId = body.roomId !== undefined ? body.roomId?.trim() || null : existing.roomId;
        if (roomId && caller) {
          await facultyLoadService.assertRoomAssignable(roomId, existing.academicYearId, existing.semester, caller);
        }
        const request = await assignmentRequestService.createAssignmentRequest(
          {
            facultyId: newFacultyId,
            subjectId: existing.subjectId,
            studentClassId: existing.studentClassId,
            roomId,
            roomDisplayName: body.roomDisplayName !== undefined ? body.roomDisplayName ?? null : existing.roomDisplayName,
            dayOfWeek: body.dayOfWeek ?? existing.dayOfWeek,
            startTime: body.startTime ?? existing.startTime,
            endTime: body.endTime ?? existing.endTime,
            semester: existing.semester,
            academicYearId: existing.academicYearId,
            replacesLoadId: existing.id,
          },
          req.user.id
        );
        res.status(202).json({ requestCreated: true, request });
        return;
      }
    }
  }
  const before = await prisma.facultyLoad.findUnique({ where: { id: req.params.id }, select: { facultyId: true } });
  const load = await facultyLoadService.updateFacultyLoad(req.params.id, body, caller);
  const detail = `${load.subject.code} · ${load.studentClass.name}`;
  if (before?.facultyId && before.facultyId !== load.facultyId) {
    void notifyScheduleChange(before.facultyId, "removed", detail, { exceptUserId: req.user?.id });
    void notifyScheduleChange(load.facultyId, "assigned", detail, { exceptUserId: req.user?.id });
  } else {
    void notifyScheduleChange(load.facultyId, "changed", detail, { exceptUserId: req.user?.id });
  }
  res.json(load);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : undefined;
  const gone = await prisma.facultyLoad.findUnique({
    where: { id: req.params.id },
    select: { facultyId: true, subject: { select: { code: true } }, studentClass: { select: { name: true } } },
  });
  await facultyLoadService.deleteFacultyLoad(req.params.id, caller);
  if (gone) void notifyScheduleChange(gone.facultyId, "removed", `${gone.subject?.code ?? ""} · ${gone.studentClass?.name ?? ""}`, { exceptUserId: req.user?.id });
  res.status(204).send();
}

export async function autoAssign(req: Request, res: Response): Promise<void> {
  const body = req.body as AutoAssignFacultyLoadBody;
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : undefined;
  const summary = await facultyLoadService.autoAssignForClass(
    body.academicYearId,
    body.semester,
    body.studentClassId,
    body.ruleSetId,
    caller
  );
  res.json(summary);
}

export async function resetForClass(req: Request, res: Response): Promise<void> {
  const body = req.body as ResetFacultyLoadBody;
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : undefined;
  await facultyLoadService.resetForClass(body.academicYearId, body.semester, body.studentClassId, caller);
  res.status(204).send();
}

export async function copyFromPrevious(req: Request, res: Response): Promise<void> {
  const body = req.body as CopyFromPreviousFacultyLoadBody;
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : undefined;
  const summary = await facultyLoadService.copyClassSchedule(body, caller);
  res.json(summary);
}

export async function loadedUnits(req: Request, res: Response): Promise<void> {
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) {
    res.status(400).json({ message: "academicYearId query is required" });
    return;
  }
  // Chairman only sees their own department's faculty.
  if (req.user?.role === "CHAIRMAN" && !req.user.departmentId) {
    res.json({});
    return;
  }
  const scopeDept = req.user?.role === "CHAIRMAN" ? req.user.departmentId : null;
  res.json(await facultyLoadService.getLoadedUnitsByFaculty(academicYearId, semester, scopeDept));
}

export async function availability(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as SlotAvailabilityQuery;
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : undefined;
  res.json(await facultyLoadService.getSlotAvailability(q, caller));
}