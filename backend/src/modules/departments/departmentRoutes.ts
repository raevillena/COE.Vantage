import { Router } from "express";
import { list, getById, create, update, remove } from "./departmentController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createDepartmentSchema, updateDepartmentSchema } from "./departmentSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN"));

router.get("/", list);
router.get("/:id", getById);
router.post("/", validate(createDepartmentSchema), create);
router.patch("/:id", validate(updateDepartmentSchema), update);
router.delete("/:id", remove);

export const departmentRoutes = router;
