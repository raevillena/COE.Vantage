import { Router } from "express";
import { list, getById, create, update, remove, listTrash, restore, permanentDelete, getPrioritizedFaculty, putPrioritizedFaculty } from "./subjectController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createSubjectSchema, updateSubjectSchema, putPrioritizedFacultySchema } from "./subjectSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "DEAN", "CHAIRMAN"));

router.get("/trash", authorize("ADMIN"), listTrash);
router.delete("/trash/:id", authorize("ADMIN"), permanentDelete);

router.get("/", list);
router.get("/:id/prioritized-faculty", getPrioritizedFaculty);
router.put("/:id/prioritized-faculty", authorize("ADMIN", "CHAIRMAN"), validate(putPrioritizedFacultySchema), putPrioritizedFaculty);
router.get("/:id", getById);
router.post("/", validate(createSubjectSchema), create);
router.patch("/:id", validate(updateSubjectSchema), update);
router.delete("/:id", remove);

router.post("/:id/restore", authorize("ADMIN"), restore);

export const subjectRoutes = router;