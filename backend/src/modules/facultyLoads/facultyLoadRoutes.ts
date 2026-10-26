import { Router } from "express";
import { list, getById, preview, create, update, remove, autoAssign, resetForClass, copyFromPrevious, loadedUnits, availability } from "./facultyLoadController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, readOnly } from "../../middleware/authorize.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import {
  createFacultyLoadSchema,
  updateFacultyLoadSchema,
  previewFacultyLoadSchema,
  autoAssignFacultyLoadSchema,
  resetFacultyLoadSchema,
  copyFromPreviousFacultyLoadSchema,
  slotAvailabilityQuerySchema,
} from "./facultyLoadSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "DEAN", "CHAIRMAN", "OFFICER", "COLLEGE_SECRETARY"));
router.use(readOnly("COLLEGE_SECRETARY"));

router.get("/", list);
router.post("/preview", validate(previewFacultyLoadSchema), preview);
router.post("/auto-assign", validate(autoAssignFacultyLoadSchema), authorize("CHAIRMAN"), autoAssign);
router.post("/reset", validate(resetFacultyLoadSchema), authorize("CHAIRMAN"), resetForClass);
router.post(
  "/copy-from-previous",
  validate(copyFromPreviousFacultyLoadSchema),
  authorize("CHAIRMAN"),
  copyFromPrevious
);
router.get("/units", loadedUnits);
router.get("/availability", validateQuery(slotAvailabilityQuerySchema), availability);
router.get("/:id", getById);
router.post("/", validate(createFacultyLoadSchema), authorize("CHAIRMAN"), create);
router.patch("/:id", validate(updateFacultyLoadSchema), authorize("CHAIRMAN"), update);
router.delete("/:id", authorize("CHAIRMAN"), remove);

export const facultyLoadRoutes = router;