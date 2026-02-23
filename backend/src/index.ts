/// <reference path="./types/express.d.ts" />
import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import { env } from "./config/env.js";
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
import { reportRoutes } from "./modules/reports/reportRoutes.js";

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
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
app.use("/reports", reportRoutes);

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});
