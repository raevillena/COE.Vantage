import { Router } from "express";
import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { validate, validateParams, validateQuery } from "../../middleware/validate.js";
import { createLink, listMyLinks, publicCalendar, publicSchedule, revokeLink } from "./scheduleShareService.js";

const createSchema = z.object({
  body: z.object({
    kind: z.enum(["FACULTY", "CLASS"]),
    targetId: z.string().uuid(),
    expiresInDays: z.number().int().min(1).max(365).optional(),
  }),
});
const listQuery = z.object({ query: z.object({ kind: z.enum(["FACULTY", "CLASS"]).optional(), targetId: z.string().uuid().optional() }) });
const idParams = z.object({ params: z.object({ id: z.string().uuid() }) });
const tokenParams = z.object({ params: z.object({ token: z.string().min(20).max(100).regex(/^[A-Za-z0-9_-]+$/) }) });

/** Signed-in management of the links: /schedule-share */
export const scheduleShareRoutes = Router();
scheduleShareRoutes.use(authenticate);
scheduleShareRoutes.get("/", validateQuery(listQuery), async (req: Request, res: Response) => {
  res.json(await listMyLinks(req.user!, req.query as { kind?: string; targetId?: string }));
});
scheduleShareRoutes.post("/", validate(createSchema), async (req: Request, res: Response) => {
  res.status(201).json(await createLink(req.user!, req.body));
});
scheduleShareRoutes.delete("/:id", validateParams(idParams), async (req: Request, res: Response) => {
  await revokeLink(req.user!, req.params.id);
  res.json({ message: "Link turned off" });
});

/** Open to anyone holding the link: /public/schedule/:token. Rate limited per address; an unknown token is a plain 404. */
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, message: { message: "Too many requests. Please wait and try again." }, standardHeaders: true, legacyHeaders: false });
export const publicScheduleRoutes = Router();
publicScheduleRoutes.use(publicLimiter);
publicScheduleRoutes.get("/:token", validateParams(tokenParams), async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.json(await publicSchedule(req.params.token));
});
publicScheduleRoutes.get("/:token/calendar.ics", validateParams(tokenParams), async (req: Request, res: Response) => {
  const { ics, filename } = await publicCalendar(req.params.token);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(ics);
});
