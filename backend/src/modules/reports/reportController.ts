import type { Request, Response } from "express";
import * as reportService from "./reportService.js";
import { forbidden, badRequest } from "../../utils/errors.js";
import * as reportExcel from "./reportExcel.js";

function assertFacultyReportAccess(user: { role: string; id: string }, facultyId: string): void {
  if (user.role !== "ADMIN" && user.role !== "DEAN" && user.role !== "CHAIRMAN" && user.role !== "COLLEGE_SECRETARY" && user.id !== facultyId) {
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
  if (user.role !== "ADMIN" && user.role !== "DEAN" && user.role !== "CHAIRMAN" && user.role !== "COLLEGE_SECRETARY") {
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

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function parseExcelQuery(req: Request): { academicYearId: string; semester: number; id?: string } {
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) throw badRequest("academicYearId query is required");
  if (![1, 2, 3].includes(semester)) throw badRequest("semester must be 1, 2 or 3");
  const id = req.query.id ? String(req.query.id) : undefined;
  return { academicYearId, semester, id };
}

function assertExcelExportAccess(user: { role: string; departmentId?: string | null }): void {
  if (user.role !== "ADMIN" && user.role !== "DEAN" && user.role !== "CHAIRMAN" && user.role !== "COLLEGE_SECRETARY") {
    throw forbidden("Not allowed to export this report");
  }
  if (user.role === "CHAIRMAN" && !user.departmentId) throw forbidden("Chairman must belong to a department");
}

export async function classSchedulesExcel(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  assertExcelExportAccess(user);
  const { academicYearId, semester, id } = parseExcelQuery(req);
  const caller = { role: user.role, departmentId: user.departmentId ?? null };
  const data = await reportExcel.loadClassSchedulesForExcel(academicYearId, semester, caller, id);
  const buffer = await reportExcel.buildClassSchedulesWorkbook(data, semester);
  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="class-schedules-${data.academicYearName || academicYearId}-S${semester}.xlsx"`
  );
  res.send(buffer);
}

export async function facultyWorkloadsExcel(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  assertExcelExportAccess(user);
  const { academicYearId, semester, id } = parseExcelQuery(req);
  const caller = { role: user.role, departmentId: user.departmentId ?? null };
  const data = await reportExcel.loadFacultyWorkloadsForExcel(academicYearId, semester, caller, id);
  const buffer = await reportExcel.buildFacultyWorkloadWorkbook(data, semester);
  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="faculty-workloads-${data.academicYearName || academicYearId}-S${semester}.xlsx"`
  );
  res.send(buffer);
}
