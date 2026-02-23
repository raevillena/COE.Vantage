import { Router } from "express";
import { facultyReport, studentClassReport, roomReport } from "./reportController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "DEAN", "CHAIRMAN", "FACULTY"));

router.get("/faculty/:facultyId", facultyReport);
router.get("/student-class/:classId", studentClassReport);
router.get("/room/:roomId", roomReport);

export const reportRoutes = router;