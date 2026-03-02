import { Router } from "express";
import multer from "multer";
import { list, getById, create, update, remove, listTrash, restore, permanentDelete, extractFromImage, applyImport, getCurriculumSubjects } from "./curriculumController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createCurriculumSchema, updateCurriculumSchema, applyImportSchema } from "./curriculumSchemas.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);
router.use(authorize("ADMIN", "OFFICER", "DEAN", "CHAIRMAN"));

router.get("/trash", authorize("ADMIN"), listTrash);
router.delete("/trash/:id", authorize("ADMIN"), permanentDelete);

router.get("/", list);
router.get("/:id/subjects", getCurriculumSubjects);
router.get("/:id", getById);
router.post("/", authorize("ADMIN", "CHAIRMAN"), validate(createCurriculumSchema), create);
router.patch("/:id", authorize("ADMIN", "CHAIRMAN"), validate(updateCurriculumSchema), update);
router.delete("/:id", authorize("ADMIN", "CHAIRMAN"), remove);

router.post("/:id/restore", authorize("ADMIN"), restore);

router.post("/extract-from-image", upload.single("image"), extractFromImage);
router.post("/apply-import", authorize("ADMIN", "CHAIRMAN"), validate(applyImportSchema), applyImport);

export const curriculumRoutes = router;