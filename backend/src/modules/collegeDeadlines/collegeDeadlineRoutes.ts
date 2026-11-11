import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { validate, validateParams } from "../../middleware/validate.js";
import { createDeadline, deleteDeadline, listDeadlines, updateDeadline } from "./collegeDeadlineService.js";

const roleEnum = z.enum(["DEAN", "CHAIRMAN", "FACULTY", "OFFICER", "COLLEGE_SECRETARY"]);
const body = z.object({
  title: z.string().trim().min(1, "A title is needed").max(200),
  description: z.string().max(2000).optional().nullable(),
  dueAt: z.coerce.date(),
  audienceRoles: z.array(roleEnum).max(5).default([]),
  reminderDays: z.array(z.number().int().min(0).max(60)).max(8).default([7, 3, 1]),
  reminderHour: z.number().int().min(0).max(23).default(8),
});
const createSchema = z.object({ body });
const idParams = z.object({ params: z.object({ id: z.string().uuid() }) });

export const collegeDeadlineRoutes = Router();
collegeDeadlineRoutes.use(authenticate);

// Everyone in the college can read; only the college secretary (and the admin) can change.
collegeDeadlineRoutes.get("/", async (req: Request, res: Response) => {
  res.json(await listDeadlines(req.user!));
});
collegeDeadlineRoutes.post("/", validate(createSchema), async (req: Request, res: Response) => {
  res.status(201).json(await createDeadline(req.user!, req.body));
});
collegeDeadlineRoutes.patch("/:id", validateParams(idParams), validate(createSchema), async (req: Request, res: Response) => {
  res.json(await updateDeadline(req.user!, req.params.id, req.body));
});
collegeDeadlineRoutes.delete("/:id", validateParams(idParams), async (req: Request, res: Response) => {
  await deleteDeadline(req.user!, req.params.id);
  res.json({ message: "Deadline removed" });
});
