import type { NextFunction, Request, Response } from "express";
import * as reportService from "./reportService.js";
import { forbidden, badRequest } from "../../utils/errors.js";
import * as reportExcel from "./reportExcel.js";
import { prisma } from "../../prisma/client.js";

type Caller = { role: string; id: string; departmentId?: string | null };

/**
 * A faculty member sees schedules only once their college has finalised (locked) the term; until then the
 * blocks may still change. Everyone else works with the live schedule.
 */
async function isReleasedFor(user: { role: string; collegeId?: string | null }, academicYearId: string, semester: number): Promise<boolean> {
  if (user.role !== "FACULTY") return true;
  if (!user.collegeId) return false;
  const lock = await prisma.termLock.findFirst({ where: { academicYearId, semester, collegeId: user.collegeId }, select: { id: true } });
  return Boolean(lock);
}

export async function requireReleasedForFaculty(req: Request, res: Response, next: NextFunction): Promise<void> {
  const academicYearId = String(req.query.academicYearId ?? "");
  if (req.user?.role === "FACULTY" && academicYearId && !(await isReleasedFor(req.user, academicYearId, Number(req.query.semester ?? 1)))) {
    res.status(403).json({ message: "Schedules are shown once your college finalises (locks) this term." });
    return;
  }
  next();
}

/** Whether the schedules of a term are shown to the signed-in person yet. */
export async function released(req: Request, res: Response): Promise<void> {
  const academicYearId = String(req.query.academicYearId ?? "");
  if (!academicYearId) throw badRequest("academicYearId query is required");
  res.json({ released: await isReleasedFor(req.user!, academicYearId, Number(req.query.semester ?? 1)) });
}

/**
 * Faculty report scope: admin, dean and college secretary see anyone; a chairman sees their own department
 * (and themselves); a faculty member sees only themselves.
 */
async function assertFacultyReportAccess(user: Caller, facultyId: string): Promise<void> {
  if (user.id === facultyId || user.role === "ADMIN" || user.role === "DEAN" || user.role === "COLLEGE_SECRETARY") return;
  if (user.role === "CHAIRMAN" && user.departmentId) {
    const target = await prisma.user.findUnique({ where: { id: facultyId }, select: { departmentId: true } });
    if (target?.departmentId === user.departmentId) return;
  }
  throw forbidden("Not allowed to view this report");
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
  await assertFacultyReportAccess(user, facultyId);
  const data = await reportService.getFacultyLoadsForReport(facultyId, academicYearId, semester);
  res.json(data);
}

/** Content-Disposition for a PDF named like "faculty-Maria Santos.pdf": characters Windows rejects are dropped, and non-ASCII names go in filename* too. */
function pdfAttachment(prefix: string, name: string): string {
  const base = `${prefix}-${name}`.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  const file = `${base}.pdf`;
  const ascii = file.replace(/[^ -~]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file)}`;
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
  await assertFacultyReportAccess(user, facultyId);
  const { faculty, loads } = await reportService.getFacultyLoadsForReport(facultyId, academicYearId, semester);
  const academicYear = loads[0]?.academicYear?.name ?? "";
  const doc = reportService.buildFacultyPdf(faculty, loads, academicYear, semester);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", pdfAttachment("faculty", faculty.name));
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
  await assertFacultyReportAccess(user, facultyId);
  const { faculty, loads } = await reportService.getFacultyLoadsForReport(facultyId, academicYearId, semester);
  const academicYear = loads[0]?.academicYear?.name ?? "";
  const doc = reportService.buildNotaPdf(faculty, loads, academicYear, semester);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", pdfAttachment("NOTA", faculty.name));
  doc.pipe(res);
  doc.end();
}

/**
 * Class schedule scope: admin, dean and college secretary see every class; a chairman the classes of their
 * department curricula; a faculty member only classes where they teach a block in that term.
 */
async function assertClassReportAccess(user: Caller, classId: string, academicYearId: string, semester: number): Promise<void> {
  if (user.role === "ADMIN" || user.role === "DEAN" || user.role === "COLLEGE_SECRETARY") return;
  if (user.role === "CHAIRMAN") {
    if (!user.departmentId) throw forbidden("Not allowed to view this report");
    const cls = await prisma.studentClass.findUnique({ where: { id: classId }, select: { curriculum: { select: { departmentId: true } } } });
    if (cls && cls.curriculum.departmentId !== user.departmentId) throw forbidden("Not allowed to view this report");
    return;
  }
  if (user.role === "FACULTY") {
    const teaches = await prisma.facultyLoad.count({ where: { studentClassId: classId, facultyId: user.id, academicYearId, semester } });
    if (teaches > 0) return;
  }
  throw forbidden("Not allowed to view this report");
}

/** Room schedule scope: staff roles see every room; a faculty member only rooms where they teach in that term. */
async function assertRoomReportAccess(user: Caller, roomId: string, academicYearId: string, semester: number): Promise<void> {
  if (user.role === "ADMIN" || user.role === "DEAN" || user.role === "CHAIRMAN" || user.role === "COLLEGE_SECRETARY") return;
  if (user.role === "FACULTY") {
    const uses = await prisma.facultyLoad.count({ where: { roomId, facultyId: user.id, academicYearId, semester } });
    if (uses > 0) return;
  }
  throw forbidden("Not allowed to view this report");
}

/** The classes the caller teaches in a term (what a faculty member may open in the class view). */
export async function myClasses(req: Request, res: Response): Promise<void> {
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) throw badRequest("academicYearId query is required");
  const classes = await prisma.studentClass.findMany({
    where: { isDeleted: false, facultyLoads: { some: { facultyId: req.user!.id, academicYearId, semester } } },
    include: { curriculum: { select: { id: true, name: true, code: true, department: { select: { id: true, name: true, code: true } } } } },
    orderBy: [{ yearLevel: "asc" }, { name: "asc" }],
  });
  res.json(classes);
}

/** The rooms the caller teaches in during a term. */
export async function myRooms(req: Request, res: Response): Promise<void> {
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) throw badRequest("academicYearId query is required");
  const rooms = await prisma.room.findMany({
    where: { isDeleted: false, facultyLoads: { some: { facultyId: req.user!.id, academicYearId, semester } } },
    include: { department: { select: { id: true, name: true, code: true } } },
    orderBy: { name: "asc" },
  });
  res.json(rooms);
}

export async function studentClassReportData(req: Request, res: Response): Promise<void> {
  const { classId } = req.params;
  const academicYearId = String(req.query.academicYearId ?? "");
  const semester = Number(req.query.semester ?? 1);
  if (!academicYearId) {
    res.status(400).json({ message: "academicYearId query is required" });
    return;
  }
  await assertClassReportAccess(req.user!, classId, academicYearId, semester);
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
  await assertClassReportAccess(req.user!, classId, academicYearId, semester);
  const { studentClass, loads } = await reportService.getStudentClassLoadsForReport(classId, academicYearId, semester);
  const academicYear = loads[0]?.academicYear?.name ?? "";
  const doc = reportService.buildStudentClassPdf(studentClass, loads, academicYear, semester);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", pdfAttachment("class", studentClass.name));
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
  await assertRoomReportAccess(req.user!, roomId, academicYearId, semester);
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
  await assertRoomReportAccess(req.user!, roomId, academicYearId, semester);
  const { room, loads } = await reportService.getRoomLoadsForReport(roomId, academicYearId, semester);
  const academicYear = loads[0]?.academicYear?.name ?? "";
  const doc = reportService.buildRoomPdf(room, loads, academicYear, semester);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", pdfAttachment("room", room.name));
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
