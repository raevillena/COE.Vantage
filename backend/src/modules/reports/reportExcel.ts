import ExcelJS from "exceljs";
import { prisma } from "../../prisma/client.js";
import { creditedLoadUnits } from "../../utils/workload.js";
import { effectiveMaxUnits, loadDeloadings } from "../../utils/deloading.js";

/** Institutional form header used by the registrar's workload and class schedule sheets. */
const FORM_HEADER = {
  university: "MARIANO MARCOS STATE UNIVERSITY",
  office: "Office of the University Registrar",
  title: "SUMMARY OF FACULTY WORKLOAD",
  documentCode: "URO-FRM-012B",
  revisionNo: "0",
  effectivity: "September 2019",
  college: "College of Engineering",
};

export interface ExcelCaller {
  role: string;
  departmentId: string | null;
}

const DAY_LETTERS: Record<number, string> = { 1: "M", 2: "T", 3: "W", 4: "Th", 5: "F", 6: "Sa", 7: "Su" };

function semesterLabel(semester: number, academicYearName: string): string {
  const sem = semester === 1 ? "1st sem" : semester === 2 ? "2nd sem" : "Mid year";
  return `${sem} ${academicYearName}`.trim();
}

/** "14:00" -> "2:00" (12-hour clock, no AM/PM, as on the official forms). */
function shortTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${(h % 12) || 12}:${String(m ?? 0).padStart(2, "0")}`;
}

interface MeetingLoad {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: { name: string } | null;
  roomDisplayName?: string | null;
}

interface MeetingSegment {
  time: string;
  days: string;
  room: string;
}

/**
 * Collapse a course's saved meetings into segments of equal time and room, so each segment keeps
 * its own days (e.g. "MWF" in one room and "T" in another) instead of pairing arrays by position.
 */
export function buildMeetingSegments(loads: MeetingLoad[]): MeetingSegment[] {
  const groups = new Map<string, { start: string; end: string; room: string; days: Set<number> }>();
  for (const l of loads) {
    const room = (l.room?.name ?? l.roomDisplayName ?? "").trim();
    const key = `${l.startTime}|${l.endTime}|${room}`;
    if (!groups.has(key)) groups.set(key, { start: l.startTime, end: l.endTime, room, days: new Set() });
    groups.get(key)!.days.add(l.dayOfWeek);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, firstDay: Math.min(...g.days) }))
    .sort((a, b) => a.firstDay - b.firstDay || a.start.localeCompare(b.start))
    .map((g) => ({
      time: `${shortTime(g.start)}-${shortTime(g.end)}`,
      days: [...g.days].sort((a, b) => a - b).map((d) => DAY_LETTERS[d] ?? "").join(""),
      room: g.room,
    }));
}

function joinSegments(segments: MeetingSegment[]) {
  const uniqueRooms = [...new Set(segments.map((s) => s.room).filter(Boolean))];
  return {
    time: segments.map((s) => s.time).join(" / "),
    day: segments.map((s) => s.days).join(" / "),
    room: uniqueRooms.join(" / "),
  };
}

const thin = { style: "thin" as const };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const GREY_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
const YELLOW_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };

/** Writes the registrar form header (rows 1-6) and returns the first free row. */
function addFormHeader(sheet: ExcelJS.Worksheet, lastCol: number, academicYearName: string, semester: number): number {
  const metaCol = Math.max(lastCol - 2, 3);
  for (let row = 1; row <= 3; row++) sheet.mergeCells(row, 1, row, metaCol - 1);
  sheet.getCell(1, 1).value = FORM_HEADER.university;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.getCell(2, 1).value = FORM_HEADER.office;
  sheet.getCell(3, 1).value = FORM_HEADER.title;
  sheet.getCell(3, 1).font = { bold: true, size: 12 };
  const meta: Array<[string, string]> = [
    ["Document Code", FORM_HEADER.documentCode],
    ["Revision No.", FORM_HEADER.revisionNo],
    ["Effectivity Date", FORM_HEADER.effectivity],
  ];
  meta.forEach(([label, value], i) => {
    sheet.getCell(i + 1, metaCol).value = label;
    sheet.getCell(i + 1, metaCol).font = { size: 9 };
    sheet.getCell(i + 1, metaCol + 1).value = value;
    sheet.getCell(i + 1, metaCol + 1).font = { size: 9 };
  });
  sheet.getCell(5, 1).value = "College:";
  sheet.getCell(5, 2).value = FORM_HEADER.college;
  sheet.getCell(6, 1).value = "Semester:";
  sheet.getCell(6, 2).value = semesterLabel(semester, academicYearName);
  sheet.getCell(5, 1).font = { bold: true };
  sheet.getCell(6, 1).font = { bold: true };
  return 8;
}

function applyPrintSetup(sheet: ExcelJS.Worksheet, lastCol: number, lastRow: number, headerRow: number): void {
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    printArea: `A1:${sheet.getColumn(lastCol).letter}${lastRow}`,
    printTitlesRow: `${headerRow}:${headerRow}`,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
}

async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const buf = (await workbook.xlsx.writeBuffer()) as Buffer | ArrayBuffer;
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

// ---------------------------------------------------------------------------
// Export A: Student class schedules
// ---------------------------------------------------------------------------

export async function loadClassSchedulesForExcel(
  academicYearId: string,
  semester: number,
  caller: ExcelCaller,
  classId?: string
) {
  const academicYear = await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { name: true } });
  const classes = await prisma.studentClass.findMany({
    where: {
      isDeleted: false,
      ...(classId ? { id: classId } : {}),
      ...(caller.role === "CHAIRMAN" ? { curriculum: { departmentId: caller.departmentId ?? "__none__" } } : {}),
    },
    select: { id: true, name: true, yearLevel: true, curriculum: { select: { name: true } } },
    orderBy: [{ name: "asc" }],
  });
  const loads = classes.length
    ? await prisma.facultyLoad.findMany({
        where: { academicYearId, semester, studentClassId: { in: classes.map((c) => c.id) } },
        select: {
          studentClassId: true,
          subjectId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          roomDisplayName: true,
          facultyDisplayName: true,
          subject: { select: { code: true, name: true, units: true } },
          faculty: { select: { name: true } },
          room: { select: { name: true } },
        },
      })
    : [];
  return { academicYearName: academicYear?.name ?? "", classes, loads };
}

/** A bare year such as "2024" is shown as "2024 CURRICULUM", like the official sheets. */
function curriculumSuffix(name: string): string {
  const n = name.trim();
  return /^\d{4}$/.test(n) ? `${n} CURRICULUM` : n.toUpperCase();
}

export async function buildClassSchedulesWorkbook(
  data: Awaited<ReturnType<typeof loadClassSchedulesForExcel>>,
  semester: number
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Class Schedules");
  const widths = [14, 44, 8, 26, 12, 24, 36];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  const LAST = widths.length;
  let r = addFormHeader(sheet, LAST, data.academicYearName, semester);
  const firstBlockRow = r;

  const classes = [...data.classes].sort((a, b) => a.yearLevel - b.yearLevel || a.name.localeCompare(b.name));
  for (const cls of classes) {
    const classLoads = data.loads.filter((l) => l.studentClassId === cls.id);
    if (classLoads.length === 0) continue;

    sheet.mergeCells(r, 1, r, LAST);
    const titleCell = sheet.getCell(r, 1);
    titleCell.value = `${cls.name} (${curriculumSuffix(cls.curriculum.name)})`;
    titleCell.font = { bold: true, size: 12 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 1; c <= LAST; c++) sheet.getCell(r, c).border = BORDER;
    r++;

    ["Course Code", "Course Title", "Units", "Time", "Day", "Room/Bldg.", "Instructor"].forEach((h, i) => {
      const cell = sheet.getCell(r, i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = BORDER;
      cell.fill = GREY_FILL;
    });
    r++;

    const bySubject = new Map<string, typeof classLoads>();
    for (const l of classLoads) {
      if (!bySubject.has(l.subjectId)) bySubject.set(l.subjectId, []);
      bySubject.get(l.subjectId)!.push(l);
    }
    const courses = [...bySubject.values()].sort((a, b) => a[0].subject.code.localeCompare(b[0].subject.code));
    const firstRow = r;
    let totalUnits = 0;
    for (const meetings of courses) {
      const subject = meetings[0].subject;
      totalUnits += subject.units; // once per course, however many meetings or instructors it has
      const joined = joinSegments(buildMeetingSegments(meetings));
      const instructors = [
        ...new Set(meetings.map((m) => (m.faculty?.name ?? m.facultyDisplayName ?? "").trim()).filter(Boolean)),
      ].join(" / ");
      const values = [subject.code, subject.name, subject.units, joined.time, joined.day, joined.room, instructors];
      values.forEach((v, i) => {
        const cell = sheet.getCell(r, i + 1);
        cell.value = v;
        cell.border = BORDER;
        cell.alignment = { vertical: "middle", wrapText: true, horizontal: i === 2 || i === 4 ? "center" : "left" };
      });
      r++;
    }
    sheet.getCell(r, 2).value = "Total Units";
    sheet.getCell(r, 3).value = { formula: `SUM(C${firstRow}:C${r - 1})`, result: totalUnits };
    for (let c = 1; c <= LAST; c++) {
      const cell = sheet.getCell(r, c);
      cell.border = BORDER;
      cell.font = { bold: true };
      cell.fill = YELLOW_FILL;
    }
    sheet.getCell(r, 3).alignment = { horizontal: "center" };
    r += 2;
  }

  if (r === firstBlockRow) {
    sheet.getCell(r, 1).value = "No saved class schedules for the selected term.";
    r++;
  }
  sheet.views = [{ state: "frozen", ySplit: firstBlockRow - 1 }];
  applyPrintSetup(sheet, LAST, r, firstBlockRow - 1);
  return toBuffer(workbook);
}

// ---------------------------------------------------------------------------
// Export B: Faculty workload
// ---------------------------------------------------------------------------

export async function loadFacultyWorkloadsForExcel(
  academicYearId: string,
  semester: number,
  caller: ExcelCaller,
  facultyId?: string
) {
  const academicYear = await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { name: true } });
  const loads = await prisma.facultyLoad.findMany({
    where: {
      academicYearId,
      semester,
      ...(facultyId ? { facultyId } : {}),
      ...(caller.role === "CHAIRMAN" ? { faculty: { departmentId: caller.departmentId ?? "__none__" } } : {}),
    },
    select: {
      subjectId: true,
      studentClassId: true,
      facultyId: true,
      facultyDisplayName: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      roomDisplayName: true,
      subject: { select: { code: true, name: true, units: true, isLab: true } },
      studentClass: { select: { name: true, studentCount: true } },
      room: { select: { name: true } },
      faculty: {
        select: { id: true, name: true, status: true, maxUnits: true, department: { select: { name: true } } },
      },
    },
  });
  const loadedIds = new Set(loads.map((l) => l.facultyId).filter((x): x is string => !!x));
  // People whose whole assignment is deloading still belong on the form, with their other assignments.
  const deloadOnly = await prisma.facultyDeloading.findMany({
    where: {
      academicYearId,
      semester,
      ...(facultyId ? { userId: facultyId } : {}),
      user: { isDeleted: false, ...(caller.role === "CHAIRMAN" ? { departmentId: caller.departmentId ?? "__none__" } : {}) },
    },
    distinct: ["userId"],
    select: { user: { select: { id: true, name: true, status: true, maxUnits: true, department: { select: { name: true } } } } },
  });
  const extraFaculty = deloadOnly.map((d) => d.user).filter((u) => !loadedIds.has(u.id));
  const deloadings = await loadDeloadings(academicYearId, semester, [...loadedIds, ...extraFaculty.map((u) => u.id)]);
  return { academicYearName: academicYear?.name ?? "", loads, deloadings, extraFaculty };
}

const WORKLOAD_HEADERS = [
  "Name of Faculty",
  "Course Code",
  "Course Title",
  "Course/Yr/Sec",
  "No. of studs.",
  "Time",
  "Day",
  "College/ Room",
  "# of Units",
  "Actual Load",
  "Regular Load",
  "Over load",
  "OA load eqv.",
  "OTHER ASSIGNMENT(S) (OA)",
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function buildFacultyWorkloadWorkbook(
  data: Awaited<ReturnType<typeof loadFacultyWorkloadsForExcel>>,
  semester: number
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Faculty Workload");
  const widths = [32, 14, 40, 16, 9, 22, 10, 18, 9, 10, 10, 10, 10, 40];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  const LAST = widths.length;
  addFormHeader(sheet, LAST, data.academicYearName, semester);
  const headerRow = 7;
  let r = headerRow;
  WORKLOAD_HEADERS.forEach((h, i) => {
    const cell = sheet.getCell(r, i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDER;
    cell.fill = GREY_FILL;
  });
  sheet.getRow(r).height = 32;
  r += 2;

  type Entry = {
    name: string;
    status: string | null;
    maxUnits: number | null;
    deloadTotal: number;
    deloadItems: { description: string; units: number }[];
    department: string;
    loads: typeof data.loads;
  };
  const entries = new Map<string, Entry>();
  for (const l of data.loads) {
    const key = l.facultyId ?? `display:${(l.facultyDisplayName ?? "").trim().toLowerCase()}`;
    if (key === "display:") continue;
    if (!entries.has(key)) {
      entries.set(key, {
        name: l.faculty?.name ?? l.facultyDisplayName ?? "—",
        status: l.faculty?.status ?? null,
        maxUnits: l.faculty?.maxUnits ?? null,
        deloadTotal: (l.facultyId && data.deloadings.get(l.facultyId)?.total) || 0,
        deloadItems: (l.facultyId && data.deloadings.get(l.facultyId)?.items) || [],
        department: l.faculty?.department?.name ?? "OTHERS / OFF-SYSTEM FACULTY",
        loads: [],
      });
    }
    entries.get(key)!.loads.push(l);
  }

  for (const u of data.extraFaculty) {
    const summary = data.deloadings.get(u.id);
    entries.set(u.id, {
      name: u.name,
      status: u.status ?? null,
      maxUnits: u.maxUnits ?? null,
      deloadTotal: summary?.total ?? 0,
      deloadItems: summary?.items ?? [],
      department: u.department?.name ?? "OTHERS / OFF-SYSTEM FACULTY",
      loads: [],
    });
  }

  const byDepartment = new Map<string, Entry[]>();
  for (const e of entries.values()) {
    if (!byDepartment.has(e.department)) byDepartment.set(e.department, []);
    byDepartment.get(e.department)!.push(e);
  }
  const departments = [...byDepartment.keys()].sort((a, b) => {
    const aOther = a.startsWith("OTHERS") ? 1 : 0;
    const bOther = b.startsWith("OTHERS") ? 1 : 0;
    return aOther - bOther || a.localeCompare(b);
  });

  for (const dept of departments) {
    sheet.mergeCells(r, 1, r, LAST);
    const deptCell = sheet.getCell(r, 1);
    deptCell.value = dept.toUpperCase();
    deptCell.font = { bold: true };
    deptCell.alignment = { horizontal: "center" };
    deptCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
    r++;

    for (const fac of byDepartment.get(dept)!.sort((a, b) => a.name.localeCompare(b.name))) {
      sheet.getCell(r, 1).value = fac.name;
      sheet.getCell(r, 1).font = { bold: true };
      r++;

      // One row per subject+class; every meeting of it is folded into that row.
      const byCourse = new Map<string, typeof fac.loads>();
      for (const l of fac.loads) {
        const key = `${l.subjectId}|${l.studentClassId}`;
        if (!byCourse.has(key)) byCourse.set(key, []);
        byCourse.get(key)!.push(l);
      }
      const courses = [...byCourse.values()].sort(
        (a, b) =>
          a[0].subject.code.localeCompare(b[0].subject.code) ||
          a[0].studentClass.name.localeCompare(b[0].studentClass.name)
      );

      const firstRow = r;
      let units = 0;
      let actual = 0;
      for (const meetings of courses) {
        const { subject, studentClass } = meetings[0];
        const credited = creditedLoadUnits(subject.units, subject.isLab);
        units += subject.units;
        actual += credited;
        const joined = joinSegments(buildMeetingSegments(meetings));
        const values: Array<string | number | null> = [
          r === firstRow ? fac.status : null, // status sits beside the first course, as on the form
          subject.code,
          subject.name,
          studentClass.name,
          studentClass.studentCount,
          joined.time,
          joined.day,
          joined.room,
          subject.units,
          credited,
        ];
        values.forEach((v, i) => {
          const cell = sheet.getCell(r, i + 1);
          cell.value = v;
          cell.alignment = {
            vertical: "middle",
            wrapText: true,
            horizontal: i >= 4 && i !== 5 && i !== 7 ? "center" : "left",
          };
        });
        for (let c = 1; c <= LAST; c++) sheet.getCell(r, c).border = BORDER;
        r++;
      }

      // Other assignments (deloading) sit beside the courses, one item per row: its description under
      // "OTHER ASSIGNMENT(S)" and its units under "OA load eqv.". More items than courses add rows.
      fac.deloadItems.forEach((item, i) => {
        const row = firstRow + i;
        if (row > r - 1) {
          for (let c = 1; c <= LAST; c++) sheet.getCell(row, c).border = BORDER;
          r++;
        }
        const desc = sheet.getCell(row, 14);
        desc.value = item.description;
        desc.alignment = { wrapText: true, vertical: "middle" };
        const eqv = sheet.getCell(row, 13);
        eqv.value = item.units > 0 ? item.units : null; // an assignment without deloading has no equivalent
        eqv.alignment = { horizontal: "center", vertical: "middle" };
      });
      if (!sheet.getCell(firstRow, 1).value && fac.status) sheet.getCell(firstRow, 1).value = fac.status;
      const lastRow = r - 1;

      // Actual Load credits lab units 3x; Regular Load is the faculty's max units; Over load is the excess.
      sheet.getCell(r, 1).value = "Total Units";
      sheet.getCell(r, 9).value = { formula: `SUM(I${firstRow}:I${lastRow})`, result: units };
      sheet.getCell(r, 10).value = { formula: `SUM(J${firstRow}:J${lastRow})`, result: round2(actual) };
      // Regular Load = maximum units less deloading (also shown on the first row, as on the form).
      const regular = effectiveMaxUnits(fac.maxUnits, fac.deloadTotal);
      if (regular != null) {
        const firstRegular = sheet.getCell(firstRow, 11);
        firstRegular.value = regular;
        firstRegular.alignment = { horizontal: "center", vertical: "middle" };
        sheet.getCell(r, 11).value = regular;
        sheet.getCell(r, 12).value = {
          formula: `MAX(0,J${r}-K${r})`,
          result: round2(Math.max(0, actual - regular)),
        };
      }
      if (fac.deloadTotal > 0) {
        sheet.getCell(r, 13).value = { formula: `SUM(M${firstRow}:M${lastRow})`, result: fac.deloadTotal };
      }
      for (let c = 1; c <= LAST; c++) {
        const cell = sheet.getCell(r, c);
        cell.border = BORDER;
        cell.font = { bold: true };
        cell.fill = YELLOW_FILL;
        if (c >= 9 && c <= 13) cell.alignment = { horizontal: "center" };
        if (c >= 10 && c <= 12) cell.numFmt = "0.00";
      }
      r += 2;
    }
  }

  if (departments.length === 0) {
    sheet.getCell(r, 1).value = "No saved faculty loads for the selected term.";
    r++;
  }
  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  applyPrintSetup(sheet, LAST, r, headerRow);
  return toBuffer(workbook);
}
