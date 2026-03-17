import type { Request, Response } from "express";
import * as reportService from "./reportService.js";
import { forbidden } from "../../utils/errors.js";

function assertFacultyReportAccess(user: { role: string; id: string }, facultyId: string): void {
  if (user.role !== "ADMIN" && user.role !== "DEAN" && user.role !== "CHAIRMAN" && user.id !== facultyId) {
    throw forbidden("Not allowed to view this report");
  }
}

export async function facultyReportData(req: Request, res: Response): Promise<void> {
  const { facultyId } = req.params;
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) {
    res.status(400).json({ message: "academicYearId query is required" });
    return;
  }
  const user = req.user!;
  assertFacultyReportAccess(user, facultyId);
  const data = await reportService.getFacultyLoadsForReport(facultyId, academicYearId, semester);
  res.json(data);
}

export async function facultyReport(req: Request, res: Response): Promise<void> {
  const { facultyId } = req.params;
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) {
    res.status(400).json({ message: "academicYearId query is required" });
    return;
  }
  const user = req.user!;
  assertFacultyReportAccess(user, facultyId);
  const { faculty, loads } = await reportService.getFacultyLoadsForReport(facultyId, academicYearId, semester);
  const academicYear = loads[0]?.academicYear?.name ?? "";
  const doc = reportService.buildFacultyPdf(faculty, loads, academicYear, semester);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="faculty-${facultyId}.pdf"`);
  doc.pipe(res);
  doc.end();
}

export async function notaReport(req: Request, res: Response): Promise<void> {
  const { facultyId } = req.params;
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) {
    res.status(400).json({ message: "academicYearId query is required" });
    return;
  }
  const user = req.user!;
  assertFacultyReportAccess(user, facultyId);
  const { faculty, loads } = await reportService.getFacultyLoadsForReport(facultyId, academicYearId, semester);
  const academicYear = loads[0]?.academicYear?.name ?? "";
  const doc = reportService.buildNotaPdf(faculty, loads, academicYear, semester);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="NOTA-${facultyId}.pdf"`);
  doc.pipe(res);
  doc.end();
}

function assertClassReportAccess(user: { role: string }): void {
  if (user.role !== "ADMIN" && user.role !== "DEAN" && user.role !== "CHAIRMAN") {
    throw forbidden("Not allowed to view this report");
  }
}

export async function studentClassReportData(req: Request, res: Response): Promise<void> {
  const { classId } = req.params;
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) {
    res.status(400).json({ message: "academicYearId query is required" });
    return;
  }
  assertClassReportAccess(req.user!);
  const data = await reportService.getStudentClassLoadsForReport(classId, academicYearId, semester);
  res.json(data);
}

export async function studentClassReport(req: Request, res: Response): Promise<void> {
  const { classId } = req.params;
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) {
    res.status(400).json({ message: "academicYearId query is required" });
    return;
  }
  assertClassReportAccess(req.user!);
  const { studentClass, loads } = await reportService.getStudentClassLoadsForReport(classId, academicYearId, semester);
  const academicYear = loads[0]?.academicYear?.name ?? "";
  const doc = reportService.buildStudentClassPdf(studentClass, loads, academicYear, semester);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="class-${classId}.pdf"`);
  doc.pipe(res);
  doc.end();
}

export async function roomReportData(req: Request, res: Response): Promise<void> {
  const { roomId } = req.params;
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) {
    res.status(400).json({ message: "academicYearId query is required" });
    return;
  }
  assertClassReportAccess(req.user!);
  const data = await reportService.getRoomLoadsForReport(roomId, academicYearId, semester);
  res.json(data);
}

export async function roomReport(req: Request, res: Response): Promise<void> {
  const { roomId } = req.params;
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) {
    res.status(400).json({ message: "academicYearId query is required" });
    return;
  }
  assertClassReportAccess(req.user!);
  const { room, loads } = await reportService.getRoomLoadsForReport(roomId, academicYearId, semester);
  const academicYear = loads[0]?.academicYear?.name ?? "";
  const doc = reportService.buildRoomPdf(room, loads, academicYear, semester);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="room-${roomId}.pdf"`);
  doc.pipe(res);
  doc.end();
}

export async function collegeWorkloadReport(req: Request, res: Response): Promise<void> {
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

  const { academicYearName, loads } = await reportService.getCollegeFacultyLoadsForReport(
    academicYearId,
    semester,
  );
  const buffer = await reportService.buildCollegeWorkloadWorkbook(loads, academicYearName, semester);

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  const safeName = academicYearName || academicYearId;
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="college-workload-${safeName}-S${semester}.xlsx"`,
  );
  res.send(Buffer.from(buffer));
}