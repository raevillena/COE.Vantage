import { prisma } from "../../prisma/client.js";
import { notFound } from "../../utils/errors.js";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

type PDFDoc = InstanceType<typeof PDFDocument>;
import type { Request } from "express";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLOT_HEIGHT = 26;
const HOUR_START = 7;
const HOUR_END = 21;
const BLOCK_PADDING = 4;
const BLOCK_STROKE = "#94a3b8";
const GRID_STROKE = "#cbd5e1";
/** Hex colors matching the scheduler "Balanced" palette (light) for block fills. Same order as frontend. */
const PDF_PALETTE = [
  "#bfdbfe", "#a7f3d0", "#fde68a", "#ddd6fe", "#fecdd3", "#a5f3fc",
  "#fed7aa", "#d9f99d", "#f5d0fe", "#99f6e4", "#7dd3fc", "#f9a8d4",
];
/** Text on colored blocks: dark enough for contrast on light fills. */
const BLOCK_TEXT_COLOR = "#1e293b";
const BLOCK_LINE2_COLOR = "#475569";

/** Format hour (7–20) as 12-hour time e.g. "7:00 AM", "12:00 PM", "8:00 PM". */
function formatHour12(hour24: number): string {
  const h = hour24 % 12 || 12;
  const ampm = hour24 < 12 ? "AM" : "PM";
  return `${h}:00 ${ampm}`;
}

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
    select: {
      id: true,
      name: true,
      email: true,
      department: { select: { name: true } },
    },
  });
  if (!faculty) throw notFound("Faculty not found");
  const loads = await prisma.facultyLoad.findMany({
    where: { facultyId, academicYearId, semester },
    include: {
      faculty: { select: { id: true, name: true, email: true } },
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

/** Load shape for grid: room/faculty can be null when off-system. */
type GridLoad = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: { code: string };
  room?: { name: string } | null;
  roomDisplayName?: string | null;
  faculty?: { name: string } | null;
  facultyDisplayName?: string | null;
  studentClass?: { name: string };
};

/** Returns display text for room (handles off-system room). */
function roomLabel(load: GridLoad): string {
  return (load.roomDisplayName ?? load.room?.name ?? "").trim();
}

/** Returns display text for faculty (handles off-system faculty). */
function facultyLabel(load: GridLoad): string {
  return (load.facultyDisplayName ?? load.faculty?.name ?? "").trim();
}

/** Build ordered list of unique subject codes from loads; index into PDF_PALETTE gives block color. */
function subjectColorIndex(loads: GridLoad[]): Map<string, number> {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const l of loads) {
    const code = l.subject?.code ?? "";
    if (!seen.has(code)) {
      seen.add(code);
      order.push(code);
    }
  }
  const map = new Map<string, number>();
  order.forEach((code, i) => map.set(code, i % PDF_PALETTE.length));
  return map;
}

/** Options for drawGrid: title, optional subtitle, and optional second line per block. */
type DrawGridOpts = {
  title: string;
  subTitle?: string;
  /** First line is always subject code. Second line can be room/faculty/class context. */
  getBlockLine2?: (load: GridLoad) => string;
};

/** Approximate line height for font size in PDFKit (roughly 1.2 * fontSize). */
const LINE_HEIGHT = 10;

function drawGrid(doc: PDFDoc, loads: GridLoad[], opts: DrawGridOpts) {
  const margin = 50;
  const timeColWidth = 56;
  const gridLeft = margin + timeColWidth;
  const colWidth = (doc.page.width - margin * 2 - timeColWidth) / 6;
  const headerRowHeight = 22;
  const gridTop = 118;
  const totalHeight = (HOUR_END - HOUR_START) * SLOT_HEIGHT;
  const gridWidth = colWidth * 6;
  const timeLabelYOffset = (SLOT_HEIGHT - LINE_HEIGHT) / 2;

  // --- Header ---
  doc.fontSize(16).font("Helvetica-Bold").text(opts.title, margin, 36);
  if (opts.subTitle) {
    doc.fontSize(10).font("Helvetica").fillColor("#475569").text(opts.subTitle, margin, 56);
  }
  doc.fillColor("black");

  // --- Day headers: align to column left edge, centered within each column ---
  doc.fontSize(9).font("Helvetica");
  for (let d = 0; d < 6; d++) {
    const colLeft = gridLeft + d * colWidth;
    doc.text(DAYS[d], colLeft, gridTop - headerRowHeight, { align: "center", width: colWidth });
  }
  // --- Time labels: right-aligned in time column, vertically centered in each hour row ---
  for (let h = HOUR_START; h < HOUR_END; h++) {
    const rowTop = gridTop + (h - HOUR_START) * SLOT_HEIGHT;
    const timeY = rowTop + timeLabelYOffset;
    doc.text(formatHour12(h), margin, timeY, { width: timeColWidth - 6, align: "right" });
  }

  // --- Grid lines: time column left edge, then day columns; horizontal every hour ---
  doc.strokeColor(GRID_STROKE).lineWidth(0.5);
  doc.moveTo(margin, gridTop).lineTo(margin, gridTop + totalHeight).stroke();
  doc.moveTo(gridLeft, gridTop).lineTo(gridLeft, gridTop + totalHeight).stroke();
  for (let d = 1; d <= 6; d++) {
    const x = gridLeft + d * colWidth;
    doc.moveTo(x, gridTop).lineTo(x, gridTop + totalHeight).stroke();
  }
  for (let h = 0; h <= HOUR_END - HOUR_START; h++) {
    const y = gridTop + h * SLOT_HEIGHT;
    doc.moveTo(margin, y).lineTo(gridLeft + gridWidth, y).stroke();
  }
  doc.strokeColor("black");

  // --- Blocks: colored by subject (same subject = same color), text aligned inside cell ---
  const colorBySubject = subjectColorIndex(loads);
  const line2 = opts.getBlockLine2;
  loads.forEach((load) => {
    const dayIndex = load.dayOfWeek >= 1 && load.dayOfWeek <= 6 ? load.dayOfWeek - 1 : 0;
    if (dayIndex < 0) return;
    const { top, height } = timeToRow(load.startTime, load.endTime);
    const x = gridLeft + dayIndex * colWidth + 1;
    const y = gridTop + top + 1;
    const w = colWidth - 2;
    const h = Math.max(height - 2, 18);

    const code = load.subject?.code ?? "";
    const colorIndex = colorBySubject.get(code) ?? 0;
    const fill = PDF_PALETTE[colorIndex] ?? PDF_PALETTE[0];
    doc.fillColor(fill).strokeColor(BLOCK_STROKE).lineWidth(0.8);
    doc.rect(x, y, w, h).fillAndStroke(fill, BLOCK_STROKE);

    const innerW = w - BLOCK_PADDING * 2;
    const textX = x + BLOCK_PADDING;
    const secondLine = line2 ? line2(load) : "";
    const hasTwoLines = secondLine && h >= 22;
    const totalTextLines = hasTwoLines ? 2 : 1;
    const totalTextHeight = totalTextLines * LINE_HEIGHT;
    let textY = y + Math.max(BLOCK_PADDING, (h - totalTextHeight) / 2);

    doc.fontSize(8).font("Helvetica-Bold").fillColor(BLOCK_TEXT_COLOR);
    doc.text(load.subject.code, textX, textY, { width: innerW, ellipsis: true });
    textY += LINE_HEIGHT;
    if (hasTwoLines) {
      doc.fontSize(7).font("Helvetica").fillColor(BLOCK_LINE2_COLOR);
      doc.text(secondLine, textX, textY, { width: innerW, ellipsis: true });
    }
    doc.fillColor("black");
  });

  return doc;
}

/** Y position for content below the grid (summary, footer). */
function gridBottom(doc: PDFDoc): number {
  const margin = 50;
  const gridTop = 118;
  return gridTop + (HOUR_END - HOUR_START) * SLOT_HEIGHT;
}

export function buildFacultyPdf(
  faculty: { name: string; email: string },
  loads: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subject: { code: string; name: string; units: number };
    room?: { name: string } | null;
    roomDisplayName?: string | null;
    studentClass: { name: string };
    academicYear: { name: string };
  }>,
  academicYearName: string,
  semester: number
): PDFDoc {
  const doc = new PDFDocument({ margin: 50 });
  const subTitle = `${academicYearName} — Semester ${semester}`;
  drawGrid(doc, loads, {
    title: `Faculty Load: ${faculty.name}`,
    subTitle,
    getBlockLine2: (l) => [roomLabel(l), l.studentClass?.name].filter(Boolean).join(" · ") || "",
  });
  const totalUnits = loads.reduce((s, l) => s + l.subject.units, 0);
  const bottom = gridBottom(doc);
  doc.fontSize(10).font("Helvetica").fillColor("black");
  doc.text(`Total units: ${totalUnits}  ·  ${loads.length} block${loads.length !== 1 ? "s" : ""}`, 50, bottom + 14);
  doc.fontSize(8).fillColor("#64748b").text(`Generated on ${new Date().toLocaleDateString("en-PH", { dateStyle: "medium" })}`, 50, bottom + 30);
  return doc;
}

export function buildStudentClassPdf(
  studentClass: { name: string },
  loads: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subject: { code: string; name: string; units: number };
    room?: { name: string } | null;
    roomDisplayName?: string | null;
    faculty?: { name: string } | null;
    facultyDisplayName?: string | null;
    academicYear: { name: string };
  }>,
  academicYearName: string,
  semester: number
): PDFDoc {
  const doc = new PDFDocument({ margin: 50 });
  const subTitle = `${academicYearName} — Semester ${semester}`;
  drawGrid(doc, loads, {
    title: `Class Schedule: ${studentClass.name}`,
    subTitle,
    getBlockLine2: (l) => [roomLabel(l), facultyLabel(l)].filter(Boolean).join(" · ") || "",
  });
  const totalUnits = loads.reduce((s, l) => s + l.subject.units, 0);
  const bottom = gridBottom(doc);
  doc.fontSize(10).font("Helvetica").fillColor("black");
  doc.text(`Total units: ${totalUnits}  ·  ${loads.length} block${loads.length !== 1 ? "s" : ""}`, 50, bottom + 14);
  doc.fontSize(8).fillColor("#64748b").text(`Generated on ${new Date().toLocaleDateString("en-PH", { dateStyle: "medium" })}`, 50, bottom + 30);
  return doc;
}

export function buildRoomPdf(
  room: { name: string; capacity: number },
  loads: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subject: { code: string };
    faculty?: { name: string } | null;
    facultyDisplayName?: string | null;
    studentClass: { name: string };
    academicYear: { name: string };
  }>,
  academicYearName: string,
  semester: number
): PDFDoc {
  const doc = new PDFDocument({ margin: 50 });
  const subTitle = `${academicYearName} — Semester ${semester} — Capacity: ${room.capacity}`;
  drawGrid(doc, loads, {
    title: `Room: ${room.name}`,
    subTitle,
    getBlockLine2: (l) => [facultyLabel(l), l.studentClass?.name].filter(Boolean).join(" · ") || "",
  });
  const bottom = gridBottom(doc);
  doc.fontSize(10).font("Helvetica").fillColor("black");
  doc.text(`${loads.length} block${loads.length !== 1 ? "s" : ""}`, 50, bottom + 14);
  doc.fontSize(8).fillColor("#64748b").text(`Generated on ${new Date().toLocaleDateString("en-PH", { dateStyle: "medium" })}`, 50, bottom + 30);
  return doc;
}

/** Format time range for NOTA table e.g. "8:00-10:00 AM", "1:00-3:00 PM". */
function formatTimeRange12(startTime: string, endTime: string): string {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const fmt = (h: number, m: number) => {
    const hour = h % 12 || 12;
    const ampm = h < 12 ? "AM" : "PM";
    return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
  };
  return `${fmt(sh, sm)}-${fmt(eh, em)}`;
}

/** Day of week 1–6 to short name. */
function dayOfWeekToName(dayOfWeek: number): string {
  return dayOfWeek >= 1 && dayOfWeek <= 6 ? DAYS[dayOfWeek - 1] : "";
}

/** Day of week 1–6 to compact letter(s) for NOTA time codes (e.g. M, T, W, Th, F, S). */
function dayOfWeekToLetter(dayOfWeek: number): string {
  switch (dayOfWeek) {
    case 1:
      return "M";
    case 2:
      return "T";
    case 3:
      return "W";
    case 4:
      return "Th";
    case 5:
      return "F";
    case 6:
      return "S";
    default:
      return "";
  }
}

/** Minimal 12-hour time range e.g. 11-12, 1-3:30 (no AM/PM, no :00). */
function formatTimeRangeShort(startTime: string, endTime: string): string {
  const toShort = (time: string) => {
    const [h24Str, mStr] = time.split(":");
    const h24 = Number(h24Str);
    const m = Number(mStr ?? "0");
    const h12 = ((h24 % 12) || 12).toString();
    if (!m) return h12;
    return `${h12}:${m.toString().padStart(2, "0")}`;
  };
  return `${toShort(startTime)}-${toShort(endTime)}`;
}

/** One aggregated NOTA row: same subject + same class, with day/time/room combined. */
type NotaAggregatedRow = {
  subject: { code: string; name: string; units: number };
  className: string;
  days: string;
  time: string;
  room: string;
};

/** Group faculty loads by (subject code, student class); aggregate day, time, and room into single strings. */
function aggregateNotaLoads(
  loads: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subject: { code: string; name: string; units: number };
    room?: { name: string } | null;
    roomDisplayName?: string | null;
    studentClass: { name: string };
  }>
): NotaAggregatedRow[] {
  const key = (l: (typeof loads)[0]) => `${l.subject?.code ?? ""}\t${l.studentClass?.name ?? ""}`;
  const byKey = new Map<string, (typeof loads)[0][]>();
  for (const l of loads) {
    const k = key(l);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(l);
  }
  const rows: NotaAggregatedRow[] = [];
  for (const group of byKey.values()) {
    if (group.length === 0) continue;
    const first = group[0];
    const subject = first.subject;
    const className = first.studentClass?.name ?? "—";
    const sorted = [...group].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
    const daySet = new Set<number>();
    const byRange = new Map<string, number[]>(); // "HH:MM-HH:MM" -> days
    const roomSet = new Set<string>();
    for (const l of sorted) {
      daySet.add(l.dayOfWeek);
      const rangeKey = `${l.startTime}-${l.endTime}`;
      if (!byRange.has(rangeKey)) byRange.set(rangeKey, []);
      byRange.get(rangeKey)!.push(l.dayOfWeek);
      const r = (l.roomDisplayName ?? l.room?.name ?? "").trim();
      if (r) roomSet.add(r);
    }
    const days = [...daySet]
      .sort((a, b) => a - b)
      .map(dayOfWeekToName)
      .filter(Boolean)
      .join(", ");
    const timeSegments: string[] = [];
    for (const [range, dayList] of byRange) {
      const [start, end] = range.split("-");
      const letters = dayList
        .slice()
        .sort((a, b) => a - b)
        .map(dayOfWeekToLetter)
        .join("");
      timeSegments.push(`${formatTimeRangeShort(start, end)}${letters}`);
    }
    const time = timeSegments.join(". ");
    const room = [...roomSet].join("; ") || "—";
    rows.push({ subject, className, days, time, room });
  }
  rows.sort((a, b) => a.subject.code.localeCompare(b.subject.code) || a.className.localeCompare(b.className));
  return rows;
}

/** Options for NOTA (optional signatory names; when omitted, lines are left for manual signing). */
export type NotaOptions = {
  institutionName?: string;
  collegeName?: string;
  chairName?: string;
  deanName?: string;
  footerSlogan?: string;
  footerAddress?: string;
  footerEmail?: string;
  footerWebsite?: string;
};

const NOTA_DEFAULT_OPTIONS: NotaOptions = {
  institutionName: "Mariano Marcos State University",
  collegeName: "College of Arts and Sciences",
  footerSlogan: "Cultivating Minds, Transforming Futures",
  footerAddress: "CAS Building, #168 Quiling Sur, City of Batac, Ilocos Norte",
  footerEmail: "cas@mmsu.edu.ph",
  footerWebsite: "www.mmsu.edu.ph",
};

/** Build NOTA (Notice of Teaching Assignment) PDF for a faculty member. */
export function buildNotaPdf(
  faculty: { name: string; email: string; department?: { name: string } | null },
  loads: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subject: { code: string; name: string; units: number };
    room?: { name: string } | null;
    roomDisplayName?: string | null;
    studentClass: { name: string };
    academicYear: { name: string };
  }>,
  academicYearName: string,
  semester: number,
  options: NotaOptions = {}
): PDFDoc {
  const opts = { ...NOTA_DEFAULT_OPTIONS, ...options };
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });
  const margin = 50;
  const pageWidth = doc.page.width - margin * 2;
  let y = 40;

  // Title and date
  doc.fontSize(14).font("Helvetica-Bold").text("NOTICE OF TEACHING ASSIGNMENT", margin, y, { align: "center", width: pageWidth });
  y += 22;
  const dateStr = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  doc.fontSize(10).font("Helvetica").text(dateStr, margin, y, { align: "right", width: pageWidth });
  y += 28;

  // Recipient
  const facultyTitle = faculty.name.toUpperCase();
  doc.fontSize(10).font("Helvetica").text(facultyTitle + ",", margin, y);
  y += 14;
  const deptLine = faculty.department?.name ? `Faculty, Department of ${faculty.department.name}.` : "Faculty.";
  doc.text(deptLine, margin, y);
  y += 14;
  doc.text("Sir:", margin, y);
  y += 20;

  // Intro paragraph
  const semesterOrdinal = semester === 1 ? "first" : semester === 2 ? "second" : String(semester);
  const intro = `Please be informed that you are scheduled to handle the subjects listed below for the ${semesterOrdinal} semester of Academic Year ${academicYearName}.`;
  doc.fontSize(10).text(intro, margin, y, { width: pageWidth, align: "justify" });
  y += 36;

  // Table: Course Code | Course Title | Course/Year/Sec | No. of Units | Day | Time | Building/Room (widths allow aggregated day/time/room; sum = pageWidth)
  const colW = {
    code: 50,
    title: 116,
    yearSec: 66,
    units: 36,
    day: 48,
    time: 112,
    room: 84,
  };
  const tableLeft = margin;
  const rowHeight = 18;
  const headerBg = "#e5e7eb";

  // Compute header height dynamically based on wrapped text so content below is pushed down correctly.
  doc.fontSize(9).font("Helvetica-Bold");
  const headerHeight =
    Math.max(
      18,
      doc.heightOfString("Course Code", { width: colW.code - 6 }),
      doc.heightOfString("Course Title", { width: colW.title - 6 }),
      doc.heightOfString("Course/Year/Sec", { width: colW.yearSec - 6 }),
      doc.heightOfString("No. of Units", { width: colW.units - 6 }),
      doc.heightOfString("Building/Room", { width: colW.room - 6 })
    ) + 8; // padding

  doc.rect(tableLeft, y, pageWidth, headerHeight).fill(headerBg);
  doc.fillColor("black").strokeColor(GRID_STROKE).lineWidth(0.5);
  let x = tableLeft;
  doc.rect(x, y, colW.code, headerHeight).stroke();
  doc.text("Course Code", x + 3, y + 4, { width: colW.code - 6 });
  x += colW.code;
  doc.rect(x, y, colW.title, headerHeight).stroke();
  doc.text("Course Title", x + 3, y + 4, { width: colW.title - 6 });
  x += colW.title;
  doc.rect(x, y, colW.yearSec, headerHeight).stroke();
  doc.text("Course/Year/Sec", x + 3, y + 4, { width: colW.yearSec - 6 });
  x += colW.yearSec;
  doc.rect(x, y, colW.units, headerHeight).stroke();
  doc.text("No. of Units", x + 3, y + 4, { width: colW.units - 6 });
  x += colW.units;
  doc.rect(x, y, colW.day, headerHeight).stroke();
  doc.text("Day", x + 3, y + 4, { width: colW.day - 6 });
  x += colW.day;
  doc.rect(x, y, colW.time, headerHeight).stroke();
  doc.text("Time", x + 3, y + 4, { width: colW.time - 6 });
  x += colW.time;
  doc.rect(x, y, colW.room, headerHeight).stroke();
  doc.text("Building/Room", x + 3, y + 4, { width: colW.room - 6 });
  y += headerHeight;

  const aggregated = aggregateNotaLoads(loads);
  doc.font("Helvetica");
  for (const row of aggregated) {
    // Allow each cell in the row to wrap and grow the row height as needed.
    const rowHeightDynamic =
      Math.max(
        rowHeight,
        doc.heightOfString(row.subject.code, { width: colW.code - 6 }),
        doc.heightOfString(row.subject.name ?? row.subject.code, { width: colW.title - 6 }),
        doc.heightOfString(row.className, { width: colW.yearSec - 6 }),
        doc.heightOfString(String(row.subject.units), { width: colW.units - 6 }),
        doc.heightOfString(row.days, { width: colW.day - 6 }),
        doc.heightOfString(row.time, { width: colW.time - 6 }),
        doc.heightOfString(row.room, { width: colW.room - 6 })
      ) + 4; // padding

    x = tableLeft;
    doc.rect(x, y, colW.code, rowHeightDynamic).stroke();
    doc.text(row.subject.code, x + 3, y + 4, { width: colW.code - 6, ellipsis: true });
    x += colW.code;
    doc.rect(x, y, colW.title, rowHeightDynamic).stroke();
    doc.text(row.subject.name ?? row.subject.code, x + 3, y + 4, { width: colW.title - 6, ellipsis: true });
    x += colW.title;
    doc.rect(x, y, colW.yearSec, rowHeightDynamic).stroke();
    doc.text(row.className, x + 3, y + 4, { width: colW.yearSec - 6, ellipsis: true });
    x += colW.yearSec;
    doc.rect(x, y, colW.units, rowHeightDynamic).stroke();
    doc.text(String(row.subject.units), x + 3, y + 4, { width: colW.units - 6 });
    x += colW.units;
    doc.rect(x, y, colW.day, rowHeightDynamic).stroke();
    doc.text(row.days, x + 3, y + 4, { width: colW.day - 6, ellipsis: true });
    x += colW.day;
    doc.rect(x, y, colW.time, rowHeightDynamic).stroke();
    doc.text(row.time, x + 3, y + 4, { width: colW.time - 6, ellipsis: true });
    x += colW.time;
    doc.rect(x, y, colW.room, rowHeightDynamic).stroke();
    doc.text(row.room, x + 3, y + 4, { width: colW.room - 6, ellipsis: true });
    y += rowHeightDynamic;
  }
  const totalUnits = aggregated.reduce((s, r) => s + r.subject.units, 0);
  x = tableLeft;
  doc.rect(x, y, colW.code + colW.title + colW.yearSec, rowHeight).stroke();
  doc.font("Helvetica-Bold").text("Total:", x + colW.code + colW.title + colW.yearSec - 28, y + 4, { width: 24 });
  doc.rect(x + colW.code + colW.title + colW.yearSec, y, colW.units, rowHeight).stroke();
  doc.text(totalUnits.toFixed(2), x + colW.code + colW.title + colW.yearSec + 3, y + 4, { width: colW.units - 6 });
  doc.rect(x + colW.code + colW.title + colW.yearSec + colW.units, y, colW.day + colW.time + colW.room, rowHeight).stroke();
  y += rowHeight + 20;

  // Advisory
  doc.font("Helvetica").fontSize(10);
  doc.text("Pursuant to this notice, please be advised of the following:", margin, y);
  y += 18;
  const advisories = [
    "Meet your classes regularly;",
    "Notify the Chair of any concerns in the class schedule and in the progress of the class;",
    "Prepare your course syllabi following the prescribed format and furnish the office copies of said syllabi (print and electronic) a week after the start of classes;",
    "Accomplish and submit your individual workload form on time; and",
    "Submit grade sheets on time.",
  ];
  const advisoryWidth = pageWidth - 16;
  advisories.forEach((item, i) => {
    const text = `${i + 1}. ${item}`;
    const h = doc.heightOfString(text, { width: advisoryWidth });
    doc.text(text, margin + 8, y, { width: advisoryWidth });
    y += h + 4;
  });
  y += 16;

  // Signatures
  doc.text("Very truly yours,", margin, y);
  y += 24;
  doc.moveTo(margin, y).lineTo(margin + 180, y).stroke();
  y += 6;
  doc.fontSize(9).text(opts.chairName ?? "Department Chair", margin, y, { width: 180 });
  y += 28;
  doc.fontSize(10).text("Noted:", margin, y);
  y += 24;
  doc.moveTo(margin, y).lineTo(margin + 180, y).stroke();
  y += 6;
  doc.fontSize(9).text(opts.deanName ?? "Dean", margin, y, { width: 180 });
  y += 32;
  doc.fontSize(10).text("CONFORME:", margin, y);
  y += 18;
  doc.moveTo(margin, y).lineTo(margin + 200, y).stroke();
  doc.text(faculty.name, margin, y + 18, { width: 200 });
  doc.text("Name and Signature of Faculty Member", margin, y + 30, { width: 200 });
  doc.moveTo(margin + 220, y).lineTo(margin + 320, y).stroke();
  doc.text("Date Signed", margin + 220, y + 18, { width: 100 });
  y += 50;

  // Footer
  if (opts.footerSlogan) {
    doc.fontSize(9).text(opts.footerSlogan, margin, y, { align: "center", width: pageWidth });
    y += 14;
  }
  const footerLine = [opts.footerAddress, opts.footerEmail, opts.footerWebsite].filter(Boolean).join(" | ");
  if (footerLine) {
    doc.fontSize(8).fillColor("#64748b").text(footerLine, margin, y, { align: "center", width: pageWidth });
  }
  doc.fillColor("black");
  return doc;
}

export async function buildCollegeWorkloadWorkbook(
  loads: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    faculty?: { id: string; name: string; email: string | null; departmentId: string | null } | null;
    facultyDisplayName?: string | null;
    subject: { code: string; name: string; units: number; isLab: boolean };
    studentClass: { name: string | null; yearLevel: number | null } | null;
    room?: { name: string | null; isLab: boolean | null } | null;
    roomDisplayName?: string | null;
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
      faculty: load.faculty?.name ?? load.facultyDisplayName ?? "",
      email: load.faculty?.email ?? "",
      subjectCode: load.subject?.code ?? "",
      subjectName: load.subject?.name ?? "",
      units: load.subject?.units ?? 0,
      className: load.studentClass?.name ?? "",
      yearLevel: load.studentClass?.yearLevel ?? "",
      day: dayLabel,
      time: timeLabel,
      room: load.room?.name ?? load.roomDisplayName ?? "",
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
    const fid = load.faculty?.id ?? (load.facultyDisplayName ? `display:${load.facultyDisplayName}` : null);
    if (!fid || !load.subject?.code) continue;
    if (!byFaculty.has(fid)) {
      byFaculty.set(fid, {
        name: load.faculty?.name ?? load.facultyDisplayName ?? "—",
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
    const fid = load.faculty?.id ?? (load.facultyDisplayName ? `display:${load.facultyDisplayName}` : null);
    if (!fid) continue;
    if (!loadsByFaculty.has(fid)) {
      loadsByFaculty.set(fid, {
        name: load.faculty?.name ?? load.facultyDisplayName ?? "—",
        email: load.faculty?.email ?? null,
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
        const roomName = load.room?.name ?? load.roomDisplayName ?? "";
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
          load.room?.name ?? load.roomDisplayName ?? "",
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
