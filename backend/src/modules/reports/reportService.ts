import { prisma } from "../../prisma/client.js";
import { notFound } from "../../utils/errors.js";
import PDFDocument from "pdfkit";

type PDFDoc = InstanceType<typeof PDFDocument>;
import type { Request } from "express";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLOT_HEIGHT = 24;
const HOUR_START = 7;
const HOUR_END = 21;

function timeToRow(startTime: string, endTime: string): { top: number; height: number } {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMins = (sh - HOUR_START) * 60 + sm;
  const endMins = (eh - HOUR_START) * 60 + em;
  const top = (startMins / 60) * SLOT_HEIGHT;
  const height = ((endMins - startMins) / 60) * SLOT_HEIGHT;
  return { top, height };
}

export async function getFacultyLoadsForReport(
  facultyId: string,
  academicYearId: string,
  semester: number
) {
  const faculty = await prisma.user.findUnique({
    where: { id: facultyId },
    select: { id: true, name: true, email: true },
  });
  if (!faculty) throw notFound("Faculty not found");
  const loads = await prisma.facultyLoad.findMany({
    where: { facultyId, academicYearId, semester },
    include: {
      subject: true,
      studentClass: true,
      room: true,
      academicYear: true,
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return { faculty, loads };
}

export async function getStudentClassLoadsForReport(
  classId: string,
  academicYearId: string,
  semester: number
) {
  const studentClass = await prisma.studentClass.findUnique({
    where: { id: classId },
    include: { curriculum: true },
  });
  if (!studentClass) throw notFound("Student class not found");
  const loads = await prisma.facultyLoad.findMany({
    where: { studentClassId: classId, academicYearId, semester },
    include: {
      subject: true,
      faculty: { select: { id: true, name: true, email: true } },
      room: true,
      academicYear: true,
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return { studentClass, loads };
}

export async function getRoomLoadsForReport(
  roomId: string,
  academicYearId: string,
  semester: number
) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { department: true },
  });
  if (!room) throw notFound("Room not found");
  const loads = await prisma.facultyLoad.findMany({
    where: { roomId, academicYearId, semester },
    include: {
      subject: true,
      faculty: { select: { id: true, name: true } },
      studentClass: true,
      academicYear: true,
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return { room, loads };
}

function drawGrid(
  doc: PDFDoc,
  loads: Array<{ dayOfWeek: number; startTime: string; endTime: string; subject: { code: string }; room?: { name: string }; faculty?: { name: string }; studentClass?: { name: string } }>,
  opts: { title: string; subTitle?: string }
) {
  const margin = 50;
  const colWidth = (doc.page.width - margin * 2 - 80) / 6;
  const gridLeft = margin + 80;
  const gridTop = 120;
  const totalHeight = (HOUR_END - HOUR_START) * SLOT_HEIGHT;

  doc.fontSize(14).text(opts.title, margin, 40);
  if (opts.subTitle) doc.fontSize(10).text(opts.subTitle, margin, 58);
  doc.fontSize(9);

  for (let d = 1; d <= 6; d++) {
    doc.text(DAYS[d - 1], gridLeft + (d - 1) * colWidth + 4, gridTop - 20);
  }
  for (let h = HOUR_START; h < HOUR_END; h++) {
    doc.text(`${h}:00`, margin, gridTop + (h - HOUR_START) * SLOT_HEIGHT + 4);
  }

  loads.forEach((load) => {
    const dayIndex = load.dayOfWeek >= 1 && load.dayOfWeek <= 6 ? load.dayOfWeek - 1 : 0;
    if (dayIndex < 0) return;
    const { top, height } = timeToRow(load.startTime, load.endTime);
    const x = gridLeft + dayIndex * colWidth + 2;
    const y = gridTop + top + 2;
    doc.rect(x, y, colWidth - 4, Math.max(height - 4, 14)).stroke();
    doc.text(load.subject.code, x + 2, y + 2, { width: colWidth - 8, ellipsis: true });
  });

  return doc;
}

export function buildFacultyPdf(
  faculty: { name: string; email: string },
  loads: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subject: { code: string; name: string; units: number };
    room: { name: string };
    studentClass: { name: string };
    academicYear: { name: string };
  }>,
  academicYearName: string,
  semester: number
): PDFDoc {
  const doc = new PDFDocument({ margin: 50 });
  const subTitle = `${academicYearName} — Semester ${semester}`;
  drawGrid(doc, loads, { title: `Faculty Load: ${faculty.name}`, subTitle });
  const totalUnits = loads.reduce((s, l) => s + l.subject.units, 0);
  doc.fontSize(10).text(`Total units: ${totalUnits}`, 50, 130 + (HOUR_END - HOUR_START) * SLOT_HEIGHT);
  return doc;
}

export function buildStudentClassPdf(
  studentClass: { name: string },
  loads: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subject: { code: string; name: string; units: number };
    room: { name: string };
    faculty: { name: string };
    academicYear: { name: string };
  }>,
  academicYearName: string,
  semester: number
): PDFDoc {
  const doc = new PDFDocument({ margin: 50 });
  const subTitle = `${academicYearName} — Semester ${semester}`;
  drawGrid(doc, loads, { title: `Class Schedule: ${studentClass.name}`, subTitle });
  const totalUnits = loads.reduce((s, l) => s + l.subject.units, 0);
  doc.fontSize(10).text(`Total units: ${totalUnits}`, 50, 130 + (HOUR_END - HOUR_START) * SLOT_HEIGHT);
  return doc;
}

export function buildRoomPdf(
  room: { name: string; capacity: number },
  loads: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subject: { code: string };
    faculty: { name: string };
    studentClass: { name: string };
    academicYear: { name: string };
  }>,
  academicYearName: string,
  semester: number
): PDFDoc {
  const doc = new PDFDocument({ margin: 50 });
  const subTitle = `${academicYearName} — Semester ${semester} — Capacity: ${room.capacity}`;
  drawGrid(doc, loads, { title: `Room: ${room.name}`, subTitle });
  return doc;
}
