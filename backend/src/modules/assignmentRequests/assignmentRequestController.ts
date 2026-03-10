import type { Request, Response } from "express";
import * as assignmentRequestService from "./assignmentRequestService.js";
import type { CreateAssignmentRequestBody, ListAssignmentRequestsQuery, RespondAssignmentRequestBody } from "./assignmentRequestSchemas.js";

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
  res.json(result);
}

export async function reject(req: Request, res: Response): Promise<void> {
  const body = req.body as RespondAssignmentRequestBody | undefined;
  const result = await assignmentRequestService.rejectRequest(req.params.id, getCaller(req), body);
  res.json(result);
}
