import { prisma } from "../../prisma/client.js";
import { notFound } from "../../utils/errors.js";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

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

export async function getCollegeFacultyLoadsForReport(
  academicYearId: string,
  semester: number
) {
  const loads = await prisma.facultyLoad.findMany({
    where: { academicYearId, semester },
    include: {
      faculty: {
        select: { id: true, name: true, email: true, departmentId: true },
      },
      subject: {
        select: { code: true, name: true, units: true, isLab: true },
      },
      studentClass: {
        select: { name: true, yearLevel: true },
      },
      room: {
        select: { name: true, isLab: true },
      },
      academicYear: {
        select: { name: true },
      },
    },
    orderBy: [
      { faculty: { name: "asc" } },
      { dayOfWeek: "asc" },
      { startTime: "asc" },
    ],
  });

  if (loads.length === 0) {
    return { academicYearName: "", loads };
  }

  const academicYearName = loads[0].academicYear?.name ?? "";
  return { academicYearName, loads };
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

export async function buildCollegeWorkloadWorkbook(
  loads: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    faculty: { id: string; name: string; email: string | null; departmentId: string | null };
    subject: { code: string; name: string; units: number; isLab: boolean };
    studentClass: { name: string | null; yearLevel: number | null } | null;
    room: { name: string | null; isLab: boolean | null } | null;
    academicYear: { name: string | null } | null;
  }>,
  academicYearName: string,
  semester: number
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Workload");

  sheet.columns = [
    { header: "Faculty", key: "faculty", width: 28 },
    { header: "Email", key: "email", width: 28 },
    { header: "Subject Code", key: "subjectCode", width: 14 },
    { header: "Subject Name", key: "subjectName", width: 36 },
    { header: "Units", key: "units", width: 8 },
    { header: "Class", key: "className", width: 18 },
    { header: "Year Level", key: "yearLevel", width: 10 },
    { header: "Day", key: "day", width: 8 },
    { header: "Time", key: "time", width: 16 },
    { header: "Room", key: "room", width: 14 },
    { header: "Lab", key: "lab", width: 6 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (const load of loads) {
    const dayLabel =
      load.dayOfWeek >= 1 && load.dayOfWeek <= 6
        ? dayLabels[load.dayOfWeek - 1]
        : "";
    const timeLabel = `${load.startTime} – ${load.endTime}`;

    sheet.addRow({
      faculty: load.faculty?.name ?? "",
      email: load.faculty?.email ?? "",
      subjectCode: load.subject?.code ?? "",
      subjectName: load.subject?.name ?? "",
      units: load.subject?.units ?? 0,
      className: load.studentClass?.name ?? "",
      yearLevel: load.studentClass?.yearLevel ?? "",
      day: dayLabel,
      time: timeLabel,
      room: load.room?.name ?? "",
      lab: load.subject?.isLab ? "Yes" : "",
    });
  }

  const totalsSheet = workbook.addWorksheet("Totals");
  totalsSheet.columns = [
    { header: "Faculty", key: "faculty", width: 28 },
    { header: "Total Units", key: "totalUnits", width: 12 },
    { header: "Subjects", key: "subjectCount", width: 10 },
  ];
  totalsSheet.getRow(1).font = { bold: true };

  const byFaculty = new Map<
    string,
    { name: string; subjectUnits: Map<string, number> }
  >();

  for (const load of loads) {
    const fid = load.faculty?.id;
    if (!fid || !load.subject?.code) continue;
    if (!byFaculty.has(fid)) {
      byFaculty.set(fid, {
        name: load.faculty.name,
        subjectUnits: new Map<string, number>(),
      });
    }
    const entry = byFaculty.get(fid)!;
    const className = load.studentClass?.name ?? "";
    const subjectKey = `${load.subject.code}::${className}`;
    if (!entry.subjectUnits.has(subjectKey)) {
      entry.subjectUnits.set(subjectKey, load.subject.units ?? 0);
    }
  }

  Array.from(byFaculty.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((entry) => {
      const totalUnits = Array.from(entry.subjectUnits.values()).reduce(
        (sum, u) => sum + u,
        0,
      );
      totalsSheet.addRow({
        faculty: entry.name,
        totalUnits,
        subjectCount: entry.subjectUnits.size,
      });
    });

  // Detailed per-faculty sheet (stacked), following the tabular format per faculty.
  const facultyDetailSheet = workbook.addWorksheet("FacultyDetail");
  facultyDetailSheet.columns = [
    { header: "Course Code", key: "code", width: 14 },
    { header: "Course Title", key: "title", width: 40 },
    { header: "Units", key: "units", width: 8 },
    { header: "Time", key: "time", width: 18 },
    { header: "Day", key: "day", width: 10 },
    { header: "Room / Building", key: "room", width: 18 },
    { header: "Instructor", key: "instructor", width: 28 },
  ];

  const loadsByFaculty = new Map<
    string,
    {
      name: string;
      email: string | null;
      rows: typeof loads;
    }
  >();

  for (const load of loads) {
    const fid = load.faculty?.id;
    if (!fid) continue;
    if (!loadsByFaculty.has(fid)) {
      loadsByFaculty.set(fid, {
        name: load.faculty.name,
        email: load.faculty.email,
        rows: [],
      });
    }
    loadsByFaculty.get(fid)!.rows.push(load);
  }

  // Reuse the same day labels for the detailed view.
  const dayToken: Record<number, string> = {
    1: "M",
    2: "T",
    3: "W",
    4: "Th",
    5: "F",
    6: "S",
  };

  function buildDayPattern(days: number[]): string {
    const tokens = days
      .slice()
      .sort((a, b) => a - b)
      .map((d) => dayToken[d] ?? "");
    return tokens.join("");
  }

  let rowIndex = 1;

  Array.from(loadsByFaculty.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((entry) => {
      // Faculty header
      facultyDetailSheet.getRow(rowIndex).getCell(1).value = `Faculty: ${entry.name}`;
      facultyDetailSheet.mergeCells(rowIndex, 1, rowIndex, 7);
      facultyDetailSheet.getRow(rowIndex).font = { bold: true };
      rowIndex += 2;

      // Column headers
      const headerRow = facultyDetailSheet.getRow(rowIndex);
      headerRow.values = [
        undefined,
        "Course Code",
        "Course Title",
        "Units",
        "Time",
        "Day",
        "Room / Building",
        "Instructor",
      ];
      headerRow.font = { bold: true };
      rowIndex += 1;

      // Group rows per subject/class/time/room so multi-day patterns (e.g. MWF, TTh) are shown as a single line.
      const groups = new Map<
        string,
        { sample: (typeof entry.rows)[number]; days: Set<number> }
      >();
      for (const load of entry.rows) {
        if (!load.subject?.code) continue;
        const className = load.studentClass?.name ?? "";
        const roomName = load.room?.name ?? "";
        const key = [
          load.subject.code,
          className,
          load.startTime,
          load.endTime,
          roomName,
        ].join("::");
        if (!groups.has(key)) {
          groups.set(key, { sample: load, days: new Set<number>() });
        }
        if (load.dayOfWeek >= 1 && load.dayOfWeek <= 6) {
          groups.get(key)!.days.add(load.dayOfWeek);
        }
      }

      // Compute total units per faculty based on unique subject+class combinations.
      const subjectSeen = new Set<string>();
      let facultyTotalUnits = 0;

      const sortedGroups = Array.from(groups.values()).sort((a, b) => {
        const codeA = a.sample.subject?.code ?? "";
        const codeB = b.sample.subject?.code ?? "";
        return codeA.localeCompare(codeB);
      });

      for (const group of sortedGroups) {
        const load = group.sample;
        const subjectUnits = load.subject?.units ?? 0;
        const subjectKey = `${load.subject?.code ?? ""}::${load.studentClass?.name ?? ""}`;
        if (!subjectSeen.has(subjectKey)) {
          subjectSeen.add(subjectKey);
          facultyTotalUnits += subjectUnits;
        }

        const days = Array.from(group.days.values());
        const pattern = days.length > 0 ? buildDayPattern(days) : "";
        const timeLabel = `${load.startTime} – ${load.endTime}`;

        const row = facultyDetailSheet.getRow(rowIndex);
        row.values = [
          undefined,
          load.subject?.code ?? "",
          load.subject?.name ?? "",
          subjectUnits,
          timeLabel,
          pattern,
          load.room?.name ?? "",
          entry.name,
        ];
        rowIndex += 1;
      }

      // Total units row (per faculty)
      const totalRow = facultyDetailSheet.getRow(rowIndex);
      totalRow.getCell(1).value = "Total Units";
      totalRow.getCell(3).value = facultyTotalUnits;
      totalRow.font = { bold: true };
      rowIndex += 2; // blank line before next faculty
    });

  const title = academicYearName
    ? `College workload — ${academicYearName} — Semester ${semester}`
    : `College workload — Semester ${semester}`;
  sheet.insertRow(1, [title]);
  sheet.mergeCells(1, 1, 1, sheet.columnCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.font = { bold: true, size: 14 };
  sheet.spliceRows(2, 0);

  const buf = (await workbook.xlsx.writeBuffer()) as Buffer | ArrayBuffer;
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}
