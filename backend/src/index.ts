/// <reference path="./types/express.d.ts" />
import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import { env } from "./config/env.js";
import { prisma } from "./prisma/client.js";
import { redis } from "./config/redis.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRoutes } from "./modules/auth/authRoutes.js";
import { userRoutes } from "./modules/users/userRoutes.js";
import { departmentRoutes } from "./modules/departments/departmentRoutes.js";
import { roomRoutes } from "./modules/rooms/roomRoutes.js";
import { curriculumRoutes } from "./modules/curriculum/curriculumRoutes.js";
import { subjectRoutes } from "./modules/subjects/subjectRoutes.js";
import { studentClassRoutes } from "./modules/studentClasses/studentClassRoutes.js";
import { academicYearRoutes } from "./modules/academicYears/academicYearRoutes.js";
import { facultyLoadRoutes } from "./modules/facultyLoads/facultyLoadRoutes.js";
import { assignmentRequestRoutes } from "./modules/assignmentRequests/assignmentRequestRoutes.js";
import { reportRoutes } from "./modules/reports/reportRoutes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboardRoutes.js";
import { deloadingRoutes } from "./modules/deloadings/deloadingRoutes.js";
import { geImportRoutes } from "./modules/geImport/geImportRoutes.js";
import { examRoomRoutes } from "./modules/examRooms/examRoomRoutes.js";
import { feedbackRoutes } from "./modules/feedback/feedbackRoutes.js";
import { notificationRoutes } from "./modules/notifications/notificationRoutes.js";
import { roomSharingRoutes } from "./modules/roomSharing/roomSharingRoutes.js";
import { auditRoutes } from "./modules/audit/auditRoutes.js";
import { collegeRoutes, universityRoutes } from "./modules/colleges/collegeRoutes.js";
import { schedulingRuleRoutes } from "./modules/schedulingRules/schedulingRuleRoutes.js";
import { gradeSubjectRoutes } from "./modules/gradeSubjects/gradeSubjectRoutes.js";
import { publicScheduleRoutes, scheduleShareRoutes } from "./modules/scheduleShare/scheduleShareRoutes.js";
import { collegeDeadlineRoutes } from "./modules/collegeDeadlines/collegeDeadlineRoutes.js";
import { startDeadlineReminders } from "./modules/collegeDeadlines/deadlineReminders.js";
import { releaseAccessEmailLocks, resumeAccessEmailJobs } from "./modules/gradeSubjects/gradeSubjectService.js";
import { startNotificationDigest } from "./modules/notifications/notificationDigest.js";

const app = express();

if (env.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
    // Lets the browser read the server-chosen file name of downloads (cross-origin by default).
    exposedHeaders: ["Content-Disposition"],
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" })); // pasted GE schedule tables are a few hundred KB at most

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Readiness: can this backend reach its database and Redis? (/health only says the process is up.) Use it as the k8s readiness probe.
app.get("/health/ready", async (_req, res) => {
  const check = async (fn: () => Promise<unknown>) => {
    const started = Date.now();
    try {
      await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))]);
      return { ok: true, ms: Date.now() - started };
    } catch {
      return { ok: false, ms: Date.now() - started };
    }
  };
  const [database, cache] = await Promise.all([check(() => prisma.$queryRaw`SELECT 1`), check(() => redis.ping())]);
  const ok = database.ok && cache.ok;
  res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "unavailable", database, cache });
});

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/departments", departmentRoutes);
app.use("/rooms", roomRoutes);
app.use("/curriculum", curriculumRoutes);
app.use("/subjects", subjectRoutes);
app.use("/student-classes", studentClassRoutes);
app.use("/academic-years", academicYearRoutes);
app.use("/faculty-loads", facultyLoadRoutes);
app.use("/assignment-requests", assignmentRequestRoutes);
app.use("/reports", reportRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/deloadings", deloadingRoutes);
app.use("/feedback", feedbackRoutes);
app.use("/notifications", notificationRoutes);
app.use("/audit", auditRoutes);
app.use("/room-share", roomSharingRoutes);
app.use("/colleges", collegeRoutes);
app.use("/university", universityRoutes);
app.use("/ge-import", geImportRoutes);
app.use("/exam-rooms", examRoomRoutes);
app.use("/scheduling-rule-sets", schedulingRuleRoutes);
app.use("/grade-subjects", gradeSubjectRoutes);
app.use("/schedule-share", scheduleShareRoutes);
app.use("/college-deadlines", collegeDeadlineRoutes);
app.use("/public/schedule", publicScheduleRoutes);

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
  void resumeAccessEmailJobs();
  // a backend that died holds its job's lock for up to a minute: look again regularly for jobs nobody is running
  setInterval(() => void resumeAccessEmailJobs(), 15_000).unref();
  startNotificationDigest();
  startDeadlineReminders();
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void releaseAccessEmailLocks().finally(() => process.exit(0));
  });
}
