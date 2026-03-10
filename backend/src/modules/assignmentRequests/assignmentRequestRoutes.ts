import { Router } from "express";
import { create, list, getPendingCount, approve, reject } from "./assignmentRequestController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import {
  createAssignmentRequestSchema,
  listAssignmentRequestsQuerySchema,
  respondAssignmentRequestSchema,
} from "./assignmentRequestSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "DEAN", "CHAIRMAN"));

router.get("/count", getPendingCount);
router.get("/", list);
router.post("/", validate(createAssignmentRequestSchema), authorize("CHAIRMAN"), create);
router.post("/:id/approve", validate(respondAssignmentRequestSchema), approve);
router.post("/:id/reject", validate(respondAssignmentRequestSchema), reject);

export const assignmentRequestRoutes = router;
