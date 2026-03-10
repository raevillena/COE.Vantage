import { Router } from "express";
import {
  list,
  getById,
  create,
  update,
  remove,
  listAssignmentsHandler,
  setAssignmentHandler,
  removeAssignmentHandler,
  resolve,
} from "./schedulingRuleController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import {
  createSchedulingRuleSetSchema,
  updateSchedulingRuleSetSchema,
  setAssignmentSchema,
  removeAssignmentSchema,
} from "./schedulingRuleSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CHAIRMAN"));

router.get("/", list);
router.get("/resolve", resolve); // query: academicYearId, studentClassId
router.get("/assignments", listAssignmentsHandler);
router.post("/assignments", validate(setAssignmentSchema), setAssignmentHandler);
router.delete("/assignments", validate(removeAssignmentSchema), removeAssignmentHandler);
router.get("/:id", getById);
router.post("/", validate(createSchedulingRuleSetSchema), create);
router.patch("/:id", validate(updateSchedulingRuleSetSchema), update);
router.delete("/:id", remove);

export const schedulingRuleRoutes = router;
