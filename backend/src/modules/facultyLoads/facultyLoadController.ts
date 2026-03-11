import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";
import * as facultyLoadService from "./facultyLoadService.js";
import * as assignmentRequestService from "../assignmentRequests/assignmentRequestService.js";
import type {
  CreateFacultyLoadBody,
  UpdateFacultyLoadBody,
  PreviewFacultyLoadBody,
  AutoAssignFacultyLoadBody,
  ResetFacultyLoadBody,
} from "./facultyLoadSchemas.js";
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
    if (subjectDeptId != null && facultyDeptId != null && subjectDeptId !== facultyDeptId && faculty?.role === "FACULTY") {
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
  res.status(201).json(load);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateFacultyLoadBody;
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : undefined;
  const load = await facultyLoadService.updateFacultyLoad(req.params.id, body, caller);
  res.json(load);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const caller = req.user ? { role: req.user.role, departmentId: req.user.departmentId ?? null } : undefined;
  await facultyLoadService.deleteFacultyLoad(req.params.id, caller);
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