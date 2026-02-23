import { Router } from "express";
import { list, getById, create, update, remove } from "./curriculumController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createCurriculumSchema, updateCurriculumSchema } from "./curriculumSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "DEAN", "CHAIRMAN"));

router.get("/", list);
router.get("/:id", getById);
router.post("/", validate(createCurriculumSchema), create);
router.patch("/:id", validate(updateCurriculumSchema), update);
router.delete("/:id", remove);

export const curriculumRoutes = router;