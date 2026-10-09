import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/authenticate.js";
import { publicGradeComputeLimiter, publicGradeLookupLimiter } from "../../middleware/publicGradeRateLimit.js";
import { validate, validateParams, validateQuery } from "../../middleware/validate.js";
import * as controller from "./gradeSubjectController.js";
import {
  createGradeRecordSchema,
  createGradeSubjectSchema,
  importFromGoogleSheetSchema,
  importGradeRecordsSchema,
  publicComputeRecordParamsSchema,
  publicComputeRecordSchema,
  publicLookupSchema,
  sendAccessCodesSchema,
  subjectGradeRecordParamsSchema,
  updateGradeRecordSchema,
  updateGradeSubjectSchema,
  upsertViewerSchema,
} from "./gradeSubjectSchemas.js";

const router = Router();

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

router.get("/public/records", publicGradeLookupLimiter, validateQuery(publicLookupSchema), controller.publicLookup);
router.post(
  "/public/records/:recordId/compute",
  publicGradeComputeLimiter,
  validateParams(publicComputeRecordParamsSchema),
  validate(publicComputeRecordSchema),
  controller.publicComputeRecord
);

router.use(authenticate);

router.get("/", controller.list);
router.post("/", validate(createGradeSubjectSchema), controller.create);
router.get("/:id", controller.getById);
router.patch("/:id", validate(updateGradeSubjectSchema), controller.update);
router.delete("/:id", controller.remove);

router.get("/:id/viewers", controller.listSubjectViewers);
router.get("/:id/viewer-candidates", controller.listViewerCandidates);
router.put("/:id/viewers", validate(upsertViewerSchema), controller.upsertSubjectViewer);
router.delete("/:id/viewers/:userId", controller.removeSubjectViewer);

router.get("/:id/records", controller.listSubjectRecords);
router.post("/:id/records", validate(createGradeRecordSchema), controller.createSubjectRecord);
router.post("/:id/records/import", validate(importGradeRecordsSchema), controller.importSubjectRecords);
router.post("/:id/records/import-from-sheet", validate(importFromGoogleSheetSchema), controller.importSubjectFromGoogleSheet);
router.post("/:id/records/import-excel", excelUpload.single("file"), controller.importSubjectExcel);
router.post("/:id/records/import-csv", excelUpload.single("file"), controller.importSubjectCsv);
router.post(
  "/:id/records/:recordId/regenerate-code",
  validateParams(subjectGradeRecordParamsSchema),
  controller.regenerateSubjectRecordAccessCode
);
router.patch("/:id/records/:recordId", validate(updateGradeRecordSchema), controller.updateSubjectRecord);
router.delete("/:id/records/:recordId", controller.deleteSubjectRecord);
router.post("/:id/compute-grades", controller.computeSubjectGrades);
router.post("/:id/send-access-codes", validate(sendAccessCodesSchema), controller.sendSubjectAccessCodes);

export const gradeSubjectRoutes = router;

