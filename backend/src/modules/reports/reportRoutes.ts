import { Router } from "express";
import {
  facultyReport,
  facultyReportData,
  notaReport,
  studentClassReport,
  studentClassReportData,
  roomReport,
  roomReportData,
  collegeWorkloadReport,
} from "./reportController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "DEAN", "CHAIRMAN", "FACULTY"));

router.get("/faculty/:facultyId/data", facultyReportData);
router.get("/faculty/:facultyId/nota", notaReport);
router.get("/faculty/:facultyId", facultyReport);
router.get("/student-class/:classId/data", studentClassReportData);
router.get("/student-class/:classId", studentClassReport);
router.get("/room/:roomId/data", roomReportData);
router.get("/room/:roomId", roomReport);
router.get("/college-workload", collegeWorkloadReport);

export const reportRoutes = router;