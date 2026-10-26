import { Router } from "express";
import type { Request, Response } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { getDashboardSummary, getMyWorkload } from "./dashboardService.js";
import { analyticsQuerySchema, getDashboardAnalytics } from "./dashboardAnalytics.js";
import { badRequest } from "../../utils/errors.js";
import { buildDashboardExport, exportQuerySchema } from "./dashboardExport.js";

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

/** The signed-in person's own workload. Open to anyone who carries a teaching load; it never takes a user id. */
router.get("/me", authorize("FACULTY", "CHAIRMAN", "DEAN", "COLLEGE_SECRETARY"), async (req: Request, res: Response) => {
  const user = req.user!;
  const academicYearId = req.query.academicYearId ? String(req.query.academicYearId) : undefined;
  const semester = Number(req.query.semester ?? 1);
  res.json(await getMyWorkload({ id: user.id, role: user.role, departmentId: user.departmentId ?? null }, academicYearId, semester));
});

/** Download the dashboard metrics as a table: all metrics in one Excel workbook, or one metric as Excel or CSV. Same scope and filters as the detail views. */
router.get("/export", authorize("ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY"), async (req: Request, res: Response) => {
  const parsed = exportQuerySchema.safeParse(req.query);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid query");
  const user = req.user!;
  const file = await buildDashboardExport({ id: user.id, role: user.role, departmentId: user.departmentId ?? null }, parsed.data);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.send(file.buffer);
});

/** Paginated detail rows behind one dashboard metric. Same scope rules as the summary. */
router.get("/analytics", authorize("ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY"), async (req: Request, res: Response) => {
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid query");
  const user = req.user!;
  res.json(await getDashboardAnalytics({ id: user.id, role: user.role, departmentId: user.departmentId ?? null }, parsed.data));
});

export const dashboardRoutes = router;
