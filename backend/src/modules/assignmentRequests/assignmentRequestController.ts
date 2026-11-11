import type { Request, Response } from "express";
import * as assignmentRequestService from "./assignmentRequestService.js";
import { prisma } from "../../prisma/client.js";
import { audit } from "../audit/auditService.js";
import type { UpdateAssignmentRequestBody, CreateAssignmentRequestBody, ListAssignmentRequestsQuery, RespondAssignmentRequestBody } from "./assignmentRequestSchemas.js";

function getCaller(req: Request): assignmentRequestService.CallerContext {
  const user = req.user!;
  return {
    role: user.role,
    departmentId: user.departmentId ?? null,
    id: user.id,
  };
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateAssignmentRequestBody;
  const request = await assignmentRequestService.createAssignmentRequest(body, req.user!.id);
  await auditRequest(request.id, "CREATE", "Sent an assignment request");
  res.status(201).json(request);
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListAssignmentRequestsQuery;
  const list = await assignmentRequestService.listAssignmentRequests(query, getCaller(req));
  res.json(list);
}

export async function getPendingCount(req: Request, res: Response): Promise<void> {
  const count = await assignmentRequestService.getPendingCount(getCaller(req));
  res.json({ count });
}

export async function approve(req: Request, res: Response): Promise<void> {
  const body = req.body as RespondAssignmentRequestBody | undefined;
  const result = await assignmentRequestService.approveRequest(req.params.id, getCaller(req), body);
  await auditRequest(req.params.id, "UPDATE", "Approved an assignment request");
  res.json(result);
}

export async function update(req: Request, res: Response): Promise<void> {
  const updated = await assignmentRequestService.updateRequest(req.params.id, getCaller(req), req.body as UpdateAssignmentRequestBody);
  await auditRequest(req.params.id, "UPDATE", "Changed the day, time or room of an assignment request");
  res.json(updated);
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const cancelled = await assignmentRequestService.cancelRequest(req.params.id, getCaller(req));
  await auditRequest(req.params.id, "UPDATE", "Cancelled an assignment request");
  res.json(cancelled);
}

export async function reject(req: Request, res: Response): Promise<void> {
  const body = req.body as RespondAssignmentRequestBody | undefined;
  const result = await assignmentRequestService.rejectRequest(req.params.id, getCaller(req), body);
  await auditRequest(req.params.id, "UPDATE", "Rejected an assignment request");
  res.json(result);
}

/** Appends the history entry for a request after a change succeeded (best effort, never breaks the change). */
async function auditRequest(id: string, action: "CREATE" | "UPDATE", summary: string): Promise<void> {
  try {
    const r = await prisma.crossDepartmentLoadRequest.findUnique({
      where: { id },
      select: {
        academicYearId: true,
        semester: true,
        collegeId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        status: true,
        faculty: { select: { name: true } },
        subject: { select: { code: true } },
        studentClass: { select: { name: true } },
      },
    });
    if (!r) return;
    const label = `${r.subject.code} · ${r.studentClass.name} · ${r.faculty.name}`;
    await audit({ entityType: "ASSIGNMENT_REQUEST", entityId: id, entityLabel: label, action, summary: `${summary}: ${label}`, academicYearId: r.academicYearId, semester: r.semester, collegeId: r.collegeId });
  } catch (e) {
    console.error("request audit failed", e);
  }
}
