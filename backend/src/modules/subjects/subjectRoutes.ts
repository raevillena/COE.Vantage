import { Router } from "express";
import { list, getById, create, update, remove } from "./subjectController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createSubjectSchema, updateSubjectSchema } from "./subjectSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "DEAN", "CHAIRMAN"));

router.get("/", list);
router.get("/:id", getById);
router.post("/", validate(createSubjectSchema), create);
router.patch("/:id", validate(updateSubjectSchema), update);
router.delete("/:id", remove);

export const subjectRoutes = router;