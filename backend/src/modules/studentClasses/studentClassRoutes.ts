import { Router } from "express";
import { list, getById, create, update, remove, listTrash, restore, permanentDelete } from "./studentClassController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createStudentClassSchema, updateStudentClassSchema } from "./studentClassSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "DEAN", "CHAIRMAN"));

router.get("/trash", authorize("ADMIN"), listTrash);
router.delete("/trash/:id", authorize("ADMIN"), permanentDelete);

router.get("/", list);
router.get("/:id", getById);
router.post("/", validate(createStudentClassSchema), create);
router.patch("/:id", validate(updateStudentClassSchema), update);
router.delete("/:id", remove);

router.post("/:id/restore", authorize("ADMIN"), restore);

export const studentClassRoutes = router;