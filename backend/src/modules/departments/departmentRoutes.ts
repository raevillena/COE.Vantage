import { Router } from "express";
import { list, getById, create, update, remove, listTrash, restore, permanentDelete } from "./departmentController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createDepartmentSchema, updateDepartmentSchema } from "./departmentSchemas.js";

const router = Router();

router.use(authenticate);

// Trash (ADMIN only; must be before /:id)
router.get("/trash", authorize("ADMIN"), listTrash);
router.delete("/trash/:id", authorize("ADMIN"), permanentDelete);

router.get("/", authorize("ADMIN", "OFFICER", "DEAN", "CHAIRMAN"), list);
router.get("/:id", authorize("ADMIN", "OFFICER", "DEAN", "CHAIRMAN"), getById);
router.post("/", authorize("ADMIN", "OFFICER", "DEAN"), validate(createDepartmentSchema), create);
router.patch("/:id", authorize("ADMIN", "OFFICER", "DEAN"), validate(updateDepartmentSchema), update);
router.delete("/:id", authorize("ADMIN", "OFFICER", "DEAN"), remove);

router.post("/:id/restore", authorize("ADMIN"), restore);

export const departmentRoutes = router;
