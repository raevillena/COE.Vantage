import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as svc from "./roomSharingService.js";

const time = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use a time such as 7:30");
const blockBody = z.object({
  body: z.object({
    roomId: z.string().uuid(),
    academicYearId: z.string().uuid(),
    semester: z.number().int().min(1).max(3),
    studentClassId: z.string().uuid(),
    subjectId: z.string().uuid(),
    facultyId: z.string().uuid().nullish(),
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: time,
    endTime: time,
  }),
});
const roomsQuery = z.object({
  query: z.object({
    academicYearId: z.string().uuid(),
    semester: z.coerce.number().int().min(1).max(3),
    minCapacity: z.coerce.number().int().min(1).optional(),
    isLab: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  }),
});
const submitBody = z.object({ body: z.object({ draftIds: z.array(z.string().uuid()).min(1).max(200), note: z.string().max(500).nullish() }) });
const decisionBody = z.object({ body: z.object({ notes: z.string().max(500).nullish() }) });
const sideQuery = z.object({ query: z.object({ side: z.enum(["guest", "host"]).default("guest") }) });

const who = (req: Request): svc.ShareCaller => ({
  id: req.user!.id,
  name: req.user!.name ?? req.user!.email,
  role: req.user!.role,
  departmentId: req.user!.departmentId,
  collegeId: req.user!.collegeId,
});

const router = Router();
router.use(authenticate);
// Chairmen draft and approve for their department, college secretaries submit and give the final approval, deans only look.
// The president, unit viewers and the admin read (they pass the dean check on GET only).
router.use(authorize("CHAIRMAN", "COLLEGE_SECRETARY", "DEAN"));

router.get("/rooms", validateQuery(roomsQuery), async (req: Request, res: Response) => {
  const q = req.query as unknown as z.infer<typeof roomsQuery>["query"];
  res.json(await svc.listShareableRooms(who(req), q));
});

router.post("/drafts/preview", authorize("CHAIRMAN"), validate(blockBody), async (req: Request, res: Response) => {
  res.json(await svc.previewDraft(who(req), req.body));
});
router.post("/drafts", authorize("CHAIRMAN"), validate(blockBody), async (req: Request, res: Response) => {
  res.status(201).json(await svc.createDraft(who(req), req.body));
});
router.get("/drafts", async (req: Request, res: Response) => {
  res.json(await svc.listDrafts(who(req)));
});
router.delete("/drafts/:id", authorize("CHAIRMAN", "COLLEGE_SECRETARY"), async (req: Request, res: Response) => {
  await svc.deleteDraft(who(req), String(req.params.id));
  res.status(204).end();
});

router.post("/requests", authorize("COLLEGE_SECRETARY"), validate(submitBody), async (req: Request, res: Response) => {
  res.status(201).json(await svc.submitRequests(who(req), req.body));
});
router.get("/requests", validateQuery(sideQuery), async (req: Request, res: Response) => {
  const { side } = req.query as unknown as z.infer<typeof sideQuery>["query"];
  res.json(await svc.listRequests(who(req), side));
});
router.get("/requests/:id", async (req: Request, res: Response) => {
  res.json(await svc.getRequest(who(req), String(req.params.id)));
});
// The dean is never an approver: only the room's chairman and then the college secretary pass these checks.
router.post("/requests/:id/approve", authorize("CHAIRMAN", "COLLEGE_SECRETARY"), validate(decisionBody), async (req: Request, res: Response) => {
  res.json(await svc.decide(who(req), String(req.params.id), "approve", req.body.notes));
});
router.post("/requests/:id/reject", authorize("CHAIRMAN", "COLLEGE_SECRETARY"), validate(decisionBody), async (req: Request, res: Response) => {
  res.json(await svc.decide(who(req), String(req.params.id), "reject", req.body.notes));
});
router.post("/requests/:id/cancel", authorize("COLLEGE_SECRETARY"), async (req: Request, res: Response) => {
  await svc.cancelRequest(who(req), String(req.params.id));
  res.status(204).end();
});

export const roomSharingRoutes = router;
