import { Router } from "express";
import { list, getById, preview, create, update, remove } from "./facultyLoadController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import {
  createFacultyLoadSchema,
  updateFacultyLoadSchema,
  previewFacultyLoadSchema,
} from "./facultyLoadSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "DEAN", "CHAIRMAN"));

router.get("/", list);
router.post("/preview", validate(previewFacultyLoadSchema), preview);
router.get("/:id", getById);
router.post("/", validate(createFacultyLoadSchema), authorize("CHAIRMAN"), create);
router.patch("/:id", validate(updateFacultyLoadSchema), authorize("CHAIRMAN"), update);
router.delete("/:id", authorize("CHAIRMAN"), remove);

export const facultyLoadRoutes = router;