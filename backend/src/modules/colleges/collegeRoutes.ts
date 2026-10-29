import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate, validateParams } from "../../middleware/validate.js";
import { audited } from "../audit/auditService.js";
import { createCollege, deleteCollege, listColleges, universityOverview, updateCollege, updateUniversity } from "./collegeService.js";

const idParams = z.object({ params: z.object({ id: z.string().uuid() }) });
const createSchema = z.object({ body: z.object({ name: z.string().trim().min(1).max(200), code: z.string().trim().max(20).optional().nullable() }) });
const updateSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ name: z.string().trim().min(1).max(200).optional(), code: z.string().trim().max(20).optional().nullable() }),
});
const universitySchema = z.object({ body: z.object({ name: z.string().trim().min(1).max(200).optional(), code: z.string().trim().max(20).optional().nullable() }) });
const NAME = (r: Record<string, unknown>) => String(r.name);

export const collegeRoutes = Router();
collegeRoutes.use(authenticate);
// Everyone can read their own college (the admin and president read all); only the admin creates and renames colleges.
collegeRoutes.get("/", async (_req: Request, res: Response) => {
  res.json(await listColleges());
});
collegeRoutes.post("/", authorize("ADMIN"), validate(createSchema), async (req: Request, res: Response) => {
  const created = await audited(
    { entityType: "COLLEGE", model: "college", action: "CREATE", label: NAME },
    () => createCollege(req.body as { name: string; code?: string | null })
  );
  res.status(201).json(created);
});
collegeRoutes.patch("/:id", authorize("ADMIN"), validate(updateSchema), validateParams(idParams), async (req: Request, res: Response) => {
  res.json(
    await audited(
      { entityType: "COLLEGE", model: "college", action: "UPDATE", id: req.params.id, fields: ["name", "code"], label: NAME },
      () => updateCollege(req.params.id, req.body as { name?: string; code?: string | null })
    )
  );
});

collegeRoutes.delete("/:id", authorize("ADMIN"), validateParams(idParams), async (req: Request, res: Response) => {
  await audited({ entityType: "COLLEGE", model: "college", action: "DELETE", id: req.params.id, label: NAME }, () => deleteCollege(req.params.id));
  res.status(204).end();
});

export const universityRoutes = Router();
universityRoutes.use(authenticate);
universityRoutes.get("/", authorize("ADMIN", "PRESIDENT"), async (_req: Request, res: Response) => {
  res.json(await universityOverview());
});
universityRoutes.patch("/", authorize("ADMIN"), validate(universitySchema), async (req: Request, res: Response) => {
  res.json(await updateUniversity(req.body as { name?: string; code?: string | null }));
});
