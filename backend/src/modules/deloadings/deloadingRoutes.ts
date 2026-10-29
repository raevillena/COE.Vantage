import { Router } from "express";
import type { Request, Response } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { badRequest } from "../../utils/errors.js";
import { copyDeloadings, listDeloadings, replaceDeloadings } from "./deloadingService.js";
import { copyDeloadingsSchema, listDeloadingsQuerySchema, putDeloadingsSchema } from "./deloadingSchemas.js";
import { audit, audited } from "../audit/auditService.js";
import { prisma } from "../../prisma/client.js";
import type { CopyDeloadingsBody, PutDeloadingsBody } from "./deloadingSchemas.js";

const router = Router();
router.use(authenticate);

const caller = (req: Request) => ({ id: req.user!.id, role: req.user!.role, departmentId: req.user!.departmentId ?? null });

/** Deloading of the people the caller may see for one term (a faculty member sees only their own). */
router.get("/", async (req: Request, res: Response) => {
  const parsed = listDeloadingsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw badRequest("academicYearId and semester are required");
  res.json(await listDeloadings(parsed.data.academicYearId, parsed.data.semester, caller(req)));
});

router.put("/user/:userId", authorize("ADMIN", "CHAIRMAN"), validate(putDeloadingsSchema), async (req: Request, res: Response) => {
  const body = req.body as PutDeloadingsBody;
  const before = await prisma.facultyDeloading.findMany({
    where: { userId: req.params.userId, academicYearId: body.academicYearId, semester: body.semester },
    select: { description: true, units: true },
    orderBy: { description: "asc" },
  });
  const result = await replaceDeloadings(req.params.userId, body, caller(req));
  const person = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { name: true, email: true } });
  await audit({
    entityType: "DELOADING",
    entityId: req.params.userId,
    entityLabel: person ? `${person.name} (${person.email})` : null,
    action: "UPDATE",
    summary: `Changed the deloading of ${person?.name ?? "a user"}: ${result.total} ${result.total === 1 ? "unit" : "units"} this term`,
    changes: { deloading: { from: before, to: body.items.map((i) => ({ description: i.description, units: i.units })) } },
    academicYearId: body.academicYearId,
    semester: body.semester,
  });
  res.json(result);
});

router.post("/copy", authorize("ADMIN", "CHAIRMAN"), validate(copyDeloadingsSchema), async (req: Request, res: Response) => {
  res.json(await copyDeloadings(req.body as CopyDeloadingsBody, caller(req)));
});

export const deloadingRoutes = router;
