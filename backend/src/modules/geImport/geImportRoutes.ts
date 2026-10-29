import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import { badRequest } from "../../utils/errors.js";
import { classSubjectsQuerySchema, collegeQuerySchema, collegeUploadSchema, importSchema, parseTextSchema } from "./geImportSchemas.js";
import type { ClassSubjectsQuery, CollegeQuery, ImportBody } from "./geImportSchemas.js";
import { parseSource } from "./geParser.js";
import { classSubjects, previewImport, saveImport } from "./geImportService.js";
import { audit, audited } from "../audit/auditService.js";
import { prisma } from "../../prisma/client.js";
import { deleteCollegeSet, getCollegeSet, saveCollegeSet } from "./geCollegeService.js";

const router = Router();
router.use(authenticate);
// GE schedules are imported into classes from the scheduler (chairman). The college secretary keeps the college-wide sheet.
const chairman = authorize("CHAIRMAN");
const collegeStaff = authorize("COLLEGE_SECRETARY", "ADMIN");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const caller = (req: Request) => ({ role: req.user!.role, departmentId: req.user!.departmentId ?? null });

/** Reads an uploaded .xlsx / .csv / .tsv / .txt file, or pasted text in the body, into normalized rows. */
router.post("/parse", authorize("CHAIRMAN", "COLLEGE_SECRETARY", "ADMIN"), upload.single("file"), async (req: Request, res: Response) => {
  const text = req.file ? undefined : parseTextSchema.safeParse(req.body).data?.text;
  res.json(await parseSource(req.file, text));
});

// The college-wide sheet of a term: everyone who schedules can read it, the college secretary replaces or removes it.
router.get("/college", authorize("CHAIRMAN", "COLLEGE_SECRETARY", "ADMIN", "DEAN"), validateQuery(collegeQuerySchema), async (req: Request, res: Response) => {
  const q = req.query as unknown as CollegeQuery;
  res.json(await getCollegeSet(q.academicYearId, q.semester, q.collegeId));
});

router.put("/college", collegeStaff, upload.single("file"), async (req: Request, res: Response) => {
  const fields = collegeUploadSchema.safeParse(req.body);
  if (!fields.success) throw badRequest("Choose the academic year and semester");
  const parsed = await parseSource(req.file, fields.data.text);
  const saved = await saveCollegeSet(fields.data.academicYearId, fields.data.semester, parsed, {
    sourceName: req.file?.originalname ?? "Pasted rows",
    uploadedByName: req.user!.name,
    collegeId: fields.data.collegeId,
  });
  const year = await prisma.academicYear.findUnique({ where: { id: fields.data.academicYearId }, select: { name: true } });
  await audit({
    entityType: "GE_SHEET",
    entityId: saved.set.id,
    entityLabel: `${year?.name ?? ""}, ${["", "1st Sem", "2nd Sem", "Mid Year"][fields.data.semester] ?? fields.data.semester}`,
    action: "IMPORT",
    summary: `Uploaded the college GE sheet for ${year?.name ?? ""}, ${["", "1st Sem", "2nd Sem", "Mid Year"][fields.data.semester] ?? fields.data.semester} (${parsed.rows.length} rows)`,
    academicYearId: fields.data.academicYearId,
    semester: fields.data.semester,
  });
  res.json(saved);
});

router.delete("/college", collegeStaff, validateQuery(collegeQuerySchema), async (req: Request, res: Response) => {
  const q = req.query as unknown as CollegeQuery;
  await deleteCollegeSet(q.academicYearId, q.semester, q.collegeId);
  const year = await prisma.academicYear.findUnique({ where: { id: q.academicYearId }, select: { name: true } });
  await audit({
    entityType: "GE_SHEET",
    entityLabel: `${year?.name ?? ""}, ${["", "1st Sem", "2nd Sem", "Mid Year"][q.semester] ?? q.semester}`,
    action: "DELETE",
    summary: `Removed the college GE sheet for ${year?.name ?? ""}, ${["", "1st Sem", "2nd Sem", "Mid Year"][q.semester] ?? q.semester}`,
    academicYearId: q.academicYearId,
    semester: q.semester,
  });
  res.status(204).end();
});

router.get("/class-subjects", chairman, validateQuery(classSubjectsQuerySchema), async (req: Request, res: Response) => {
  const q = req.query as unknown as ClassSubjectsQuery;
  res.json(await classSubjects(q.studentClassId, q.academicYearId, q.semester, caller(req)));
});

router.post("/preview", chairman, validate(importSchema), async (req: Request, res: Response) => {
  res.json(await previewImport(req.body as ImportBody, caller(req)));
});

router.post("/save", chairman, validate(importSchema), async (req: Request, res: Response) => {
  const body = req.body as ImportBody;
  const result = await saveImport(body, caller(req));
  const cls = await prisma.studentClass.findUnique({ where: { id: body.studentClassId }, select: { name: true } });
  await audit({
    entityType: "SCHEDULE_BLOCK",
    entityLabel: cls?.name ?? null,
    action: "CREATE",
    summary: `Imported ${result.created} GE ${result.created === 1 ? "block" : "blocks"} into ${cls?.name ?? "a class"}`,
    academicYearId: body.academicYearId,
    semester: body.semester,
  });
  res.status(201).json(result);
});

export const geImportRoutes = router;
