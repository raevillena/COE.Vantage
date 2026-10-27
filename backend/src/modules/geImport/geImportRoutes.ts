import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import { badRequest } from "../../utils/errors.js";
import { classSubjectsQuerySchema, importSchema, parseTextSchema } from "./geImportSchemas.js";
import type { ClassSubjectsQuery, ImportBody } from "./geImportSchemas.js";
import { normalizeGeTable, parseTextTable, parseWorkbookTable } from "./geParser.js";
import { classSubjects, previewImport, saveImport } from "./geImportService.js";

const router = Router();
router.use(authenticate);
// The scheduler, where GE schedules are imported, belongs to the chairman.
router.use(authorize("CHAIRMAN"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const caller = (req: Request) => ({ role: req.user!.role, departmentId: req.user!.departmentId ?? null });

/** Reads an uploaded .xlsx / .csv / .tsv / .txt file, or pasted text in the body, into normalized rows. */
router.post("/parse", upload.single("file"), async (req: Request, res: Response) => {
  let table: string[][];
  if (req.file) {
    const name = req.file.originalname.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) table = await parseWorkbookTable(req.file.buffer);
    else if (name.endsWith(".xls") || name.endsWith(".pdf")) throw badRequest("Save the file as .xlsx or CSV first");
    else table = parseTextTable(req.file.buffer.toString("utf8"));
  } else {
    const parsed = parseTextSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Choose a file or paste the rows, including the header row");
    table = parseTextTable(parsed.data.text);
  }
  res.json(normalizeGeTable(table));
});

router.get("/class-subjects", validateQuery(classSubjectsQuerySchema), async (req: Request, res: Response) => {
  const q = req.query as unknown as ClassSubjectsQuery;
  res.json(await classSubjects(q.studentClassId, q.academicYearId, q.semester, caller(req)));
});

router.post("/preview", validate(importSchema), async (req: Request, res: Response) => {
  res.json(await previewImport(req.body as ImportBody, caller(req)));
});

router.post("/save", validate(importSchema), async (req: Request, res: Response) => {
  res.status(201).json(await saveImport(req.body as ImportBody, caller(req)));
});

export const geImportRoutes = router;
