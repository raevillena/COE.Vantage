import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validateQuery } from "../../middleware/validate.js";
import { exportAuditCsv, listAudit, ENTITY_LABEL } from "./auditService.js";

const filters = {
  entityType: z.string().max(200).optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().max(40).optional(),
  actorId: z.string().uuid().optional(),
  q: z.string().max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
};
const listSchema = z.object({
  query: z.object({
    ...filters,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  }),
});
const exportSchema = z.object({ query: z.object(filters) });

const router = Router();
router.use(authenticate);
// Only the admin, dean and college secretary read the history. Nothing here writes: entries can only be appended by the app.
router.use(authorize("ADMIN", "DEAN", "COLLEGE_SECRETARY"));

router.get("/kinds", (_req: Request, res: Response) => {
  res.json(ENTITY_LABEL);
});

router.get("/export.csv", validateQuery(exportSchema), async (req: Request, res: Response) => {
  const csv = await exportAuditCsv(req.query as unknown as z.infer<typeof exportSchema>["query"]);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="audit-log.csv"');
  res.send(`﻿${csv}`);
});

router.get("/", validateQuery(listSchema), async (req: Request, res: Response) => {
  res.json(await listAudit(req.query as unknown as z.infer<typeof listSchema>["query"]));
});

export const auditRoutes = router;
