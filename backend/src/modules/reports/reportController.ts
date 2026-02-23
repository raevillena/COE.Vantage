import type { Request, Response } from "express";
import * as reportService from "./reportService.js";
import { forbidden } from "../../utils/errors.js";

export async function facultyReport(req: Request, res: Response): Promise<void> {
  const { facultyId } = req.params;
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) {
    res.status(400).json({ message: "academicYearId query is required" });
    return;
  }
  const user = req.user!;
  if (user.role !== "ADMIN" && user.role !== "DEAN" && user.role !== "CHAIRMAN" && user.id !== facultyId) {
    throw forbidden("Not allowed to view this report");
  }
  const { faculty, loads } = await reportService.getFacultyLoadsForReport(facultyId, academicYearId, semester);
  const academicYear = loads[0]?.academicYear?.name ?? "";
  const doc = reportService.buildFacultyPdf(faculty, loads, academicYear, semester);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="faculty-${facultyId}.pdf"`);
  doc.pipe(res);
  doc.end();
}

export async function studentClassReport(req: Request, res: Response): Promise<void> {
  const { classId } = req.params;
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) {
    res.status(400).json({ message: "academicYearId query is required" });
    return;
  }
  const user = req.user!;
  if (user.role !== "ADMIN" && user.role !== "DEAN" && user.role !== "CHAIRMAN") {
    throw forbidden("Not allowed to view this report");
  }
  const { studentClass, loads } = await reportService.getStudentClassLoadsForReport(classId, academicYearId, semester);
  const academicYear = loads[0]?.academicYear?.name ?? "";
  const doc = reportService.buildStudentClassPdf(studentClass, loads, academicYear, semester);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="class-${classId}.pdf"`);
  doc.pipe(res);
  doc.end();
}

export async function roomReport(req: Request, res: Response): Promise<void> {
  const { roomId } = req.params;
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) {
    res.status(400).json({ message: "academicYearId query is required" });
    return;
  }
  const user = req.user!;
  if (user.role !== "ADMIN" && user.role !== "DEAN" && user.role !== "CHAIRMAN") {
    throw forbidden("Not allowed to view this report");
  }
  const { room, loads } = await reportService.getRoomLoadsForReport(roomId, academicYearId, semester);
  const academicYear = loads[0]?.academicYear?.name ?? "";
  const doc = reportService.buildRoomPdf(room, loads, academicYear, semester);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="room-${roomId}.pdf"`);
  doc.pipe(res);
  doc.end();
}