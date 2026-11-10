import { Router } from "express";
import type { Request, Response } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as service from "./examRoomService.js";
import type { ExamCaller } from "./examRoomService.js";
import {
  createExamReservationSchema,
  examTermQuerySchema,
  openExamPeriodSchema,
  requestRemovalSchema,
  respondRemovalSchema,
  setExamPeriodSchema,
  type ExamTermQuery,
} from "./examRoomSchemas.js";

const router = Router();

router.use(authenticate);

const caller = (req: Request): ExamCaller => ({
  id: req.user!.id,
  role: req.user!.role,
  departmentId: req.user!.departmentId ?? null,
  name: req.user!.name ?? req.user!.email,
});
const query = (req: Request) => req.query as unknown as ExamTermQuery;

/** Everyone who teaches (faculty, chairmen, deans, college secretaries) plots; the admin looks and can remove blocks. */
const readers = authorize("ADMIN", "FACULTY", "CHAIRMAN", "DEAN", "COLLEGE_SECRETARY");
const plotters = authorize("FACULTY", "CHAIRMAN", "DEAN", "COLLEGE_SECRETARY");

router.get("/periods", readers, validateQuery(examTermQuerySchema), async (req: Request, res: Response) => res.json(await service.listPeriods(query(req))));
router.put("/periods", authorize("ADMIN", "COLLEGE_SECRETARY"), validate(setExamPeriodSchema), async (req: Request, res: Response) => res.json(await service.setPeriod(req.body, caller(req))));
router.put("/periods/:id/open", authorize("ADMIN", "COLLEGE_SECRETARY"), validate(openExamPeriodSchema), async (req: Request, res: Response) =>
  res.json(await service.setPeriodOpen(req.params.id, (req.body as { open: boolean }).open, caller(req)))
);
router.delete("/periods/:id", authorize("ADMIN", "COLLEGE_SECRETARY"), async (req: Request, res: Response) => {
  await service.deletePeriod(req.params.id);
  res.status(204).end();
});

router.get("/rooms", readers, async (_req: Request, res: Response) => res.json(await service.listRooms()));
router.get("/my-items", plotters, validateQuery(examTermQuerySchema), async (req: Request, res: Response) => res.json(await service.listMyItems(caller(req), query(req))));

router.get("/reservations", readers, validateQuery(examTermQuerySchema), async (req: Request, res: Response) => res.json(await service.listReservations(query(req))));
router.post("/reservations", plotters, validate(createExamReservationSchema), async (req: Request, res: Response) => res.status(201).json(await service.createReservation(req.body, caller(req))));
router.delete("/reservations/:id", readers, async (req: Request, res: Response) => {
  await service.removeReservation(req.params.id, caller(req));
  res.status(204).end();
});
router.post("/reservations/:id/removal-request", authorize("CHAIRMAN"), validate(requestRemovalSchema), async (req: Request, res: Response) =>
  res.status(201).json(await service.requestRemoval(req.params.id, (req.body as { message?: string }).message, caller(req)))
);

router.get("/removal-requests", readers, async (req: Request, res: Response) => res.json(await service.listRequests(caller(req))));
router.post("/removal-requests/:id/respond", plotters, validate(respondRemovalSchema), async (req: Request, res: Response) => {
  const body = req.body as { accept: boolean; note?: string };
  await service.respondRemoval(req.params.id, body.accept, body.note, caller(req));
  res.status(204).end();
});
router.delete("/removal-requests/:id", authorize("CHAIRMAN"), async (req: Request, res: Response) => {
  await service.dismissRequest(req.params.id, caller(req));
  res.status(204).end();
});

export const examRoomRoutes = router;
