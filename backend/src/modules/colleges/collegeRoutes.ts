import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate, validateParams } from "../../middleware/validate.js";
import { audit, audited } from "../audit/auditService.js";
import { singleImage, uploadedImage, CARD_IMAGE_MAX_BYTES } from "../../utils/imageUpload.js";
import { createCollege, deleteCollege, getCollegeImage, listColleges, removeCollegeImage, setCollegeImage, universityOverview, updateCollege, updateUniversity } from "./collegeService.js";

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

collegeRoutes.put("/:id/image", authorize("ADMIN"), validateParams(idParams), singleImage("image", CARD_IMAGE_MAX_BYTES), async (req: Request, res: Response) => {
  const out = await setCollegeImage(req.params.id, uploadedImage(req));
  await audit({ entityType: "COLLEGE", entityId: req.params.id, entityLabel: out.name, collegeId: req.params.id, action: "UPDATE", summary: `Changed the card picture of ${out.name}` });
  res.json({ imageVersion: out.imageVersion });
});
collegeRoutes.delete("/:id/image", authorize("ADMIN"), validateParams(idParams), async (req: Request, res: Response) => {
  const out = await removeCollegeImage(req.params.id);
  await audit({ entityType: "COLLEGE", entityId: req.params.id, entityLabel: out.name, collegeId: req.params.id, action: "UPDATE", summary: `Removed the card picture of ${out.name}` });
  res.status(204).end();
});
collegeRoutes.get("/:id/image", validateParams(idParams), async (req: Request, res: Response) => {
  const image = await getCollegeImage(req.params.id);
  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(Buffer.from(image.data));
});

export const universityRoutes = Router();
universityRoutes.use(authenticate);
universityRoutes.get("/", authorize("ADMIN", "PRESIDENT", "UNIT"), async (_req: Request, res: Response) => {
  res.json(await universityOverview());
});
universityRoutes.patch("/", authorize("ADMIN"), validate(universitySchema), async (req: Request, res: Response) => {
  res.json(await updateUniversity(req.body as { name?: string; code?: string | null }));
});
