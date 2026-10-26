import { Router } from "express";
import type { Request, Response } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { getDashboardSummary } from "./dashboardService.js";
import { analyticsQuerySchema, getDashboardAnalytics } from "./dashboardAnalytics.js";
import { badRequest } from "../../utils/errors.js";

const router = Router();

router.use(authenticate);

/** Lightweight dashboard numbers. ADMIN/DEAN/COLLEGE_SECRETARY see the college; CHAIRMAN sees their own department. */
router.get("/summary", authorize("ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY"), async (req: Request, res: Response) => {
  const user = req.user!;
  const academicYearId = req.query.academicYearId ? String(req.query.academicYearId) : undefined;
  const semester = Number(req.query.semester ?? 1);
  res.json(
    await getDashboardSummary(
      { id: user.id, role: user.role, departmentId: user.departmentId ?? null },
      academicYearId,
      semester
    )
  );
});

/** Paginated detail rows behind one dashboard metric. Same scope rules as the summary. */
router.get("/analytics", authorize("ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY"), async (req: Request, res: Response) => {
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid query");
  const user = req.user!;
  res.json(await getDashboardAnalytics({ id: user.id, role: user.role, departmentId: user.departmentId ?? null }, parsed.data));
});

export const dashboardRoutes = router;
