import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { validate, validateParams, validateQuery } from "../../middleware/validate.js";
import { listNotifications, markAllRead, markRead, removeNotification, setSeenVersion } from "./notificationService.js";

const idParamsSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
const listQuerySchema = z.object({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }) });
const seenVersionSchema = z.object({ body: z.object({ version: z.string().max(20) }) });

const router = Router();
router.use(authenticate);

// Every role has a bell, including read-only roles: these rows are only the caller's own.
router.get("/", validateQuery(listQuerySchema), async (req: Request, res: Response) => {
  const { limit } = req.query as unknown as { limit: number };
  res.json(await listNotifications(req.user!.id, limit));
});

// Fixed paths before "/:id".
router.post("/read-all", async (req: Request, res: Response) => {
  await markAllRead(req.user!.id);
  res.status(204).end();
});

router.post("/seen-version", validate(seenVersionSchema), async (req: Request, res: Response) => {
  await setSeenVersion(req.user!.id, (req.body as { version: string }).version);
  res.status(204).end();
});

router.post("/:id/read", validateParams(idParamsSchema), async (req: Request, res: Response) => {
  await markRead(req.user!.id, req.params.id);
  res.status(204).end();
});

router.delete("/:id", validateParams(idParamsSchema), async (req: Request, res: Response) => {
  await removeNotification(req.user!.id, req.params.id);
  res.status(204).end();
});

export const notificationRoutes = router;
