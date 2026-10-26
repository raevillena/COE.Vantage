import ExcelJS from "exceljs";
import { z } from "zod";
import { badRequest } from "../../utils/errors.js";
import { analyticsQuerySchema, getDashboardAnalytics, type AnalyticsQuery } from "./dashboardAnalytics.js";
import { getDashboardSummary, type DashboardCaller } from "./dashboardService.js";

const METRICS = ["faculty-workload", "room-utilization", "curriculum-completion", "scheduling-gaps", "projection", "conflicts"] as const;
type Metric = (typeof METRICS)[number];

/** Same filters as the detail views, without paging. `metric=all` exports every metric in one workbook. */
export const exportQuerySchema = analyticsQuerySchema
  .omit({ metric: true, page: true, pageSize: true })
  .extend({
    metric: z.enum(["all", ...METRICS]).default("all"),
    format: z.enum(["xlsx", "csv"]).default("xlsx"),
  });
export type ExportQuery = z.infer<typeof exportQuerySchema>;

type Cell = string | number | null;
interface Column {
  key: string;
  header: string;
  width: number;
  align?: "center" | "right";
  /** Turns the API value into the cell value; numbers stay numbers so Excel can total and sort them. */
  map?: (value: unknown, row: Record<string, unknown>) => Cell;
}

const yesNo = (v: unknown) => (v ? "Yes" : "No");
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ROLE: Record<string, string> = { ADMIN: "Admin", DEAN: "Dean", CHAIRMAN: "Chairman", FACULTY: "Faculty", OFFICER: "Officer", COLLEGE_SECRETARY: "College Secretary" };
const STATE: Record<string, string> = { over: "Overload", under: "Underload", full: "Fully loaded", unset: "No maximum set" };
const OUTCOME: Record<string, string> = {
  schedulable: "Could be placed",
  "no-faculty": "No faculty set",
  "faculty-cap": "Faculty at unit cap",
  "no-room": "No room fits",
  "no-room-hours": "Rooms fully booked",
};
const num = (v: unknown): Cell => (typeof v === "number" ? v : null);
const str = (v: unknown): Cell => (v === null || v === undefined || v === "" ? null : String(v));

const SHEETS: Record<Metric, { name: string; title: string; columns: Column[] }> = {
  "faculty-workload": {
    name: "Faculty workload",
    title: "Faculty workload (units assigned against maximum less deloading; laboratory units count 3x)",
    columns: [
      { key: "name", header: "Name", width: 32 },
      { key: "role", header: "Role", width: 18, map: (v) => ROLE[String(v)] ?? str(v) },
      { key: "department", header: "Department", width: 34 },
      { key: "status", header: "Employment", width: 18, map: str },
      { key: "maxUnits", header: "Maximum units", width: 14, align: "right", map: num },
      { key: "deloadUnits", header: "Deloading", width: 11, align: "right", map: num },
      { key: "deloading", header: "Deloading items", width: 40, map: str },
      { key: "effectiveMax", header: "Allowed units", width: 13, align: "right", map: num },
      { key: "assignedUnits", header: "Assigned units", width: 14, align: "right", map: num },
      { key: "difference", header: "Difference", width: 11, align: "right", map: num },
      { key: "percent", header: "Used %", width: 9, align: "right", map: num },
      { key: "state", header: "Status", width: 16, map: (v) => STATE[String(v)] ?? str(v) },
    ],
  },
  "room-utilization": {
    name: "Room utilization",
    title: "Room utilization (booked hours against Mon-Sat, 7:00 AM-7:00 PM)",
    columns: [
      { key: "name", header: "Room", width: 18 },
      { key: "department", header: "Department", width: 34 },
      { key: "capacity", header: "Capacity", width: 10, align: "right", map: num },
      { key: "isLab", header: "Laboratory", width: 11, map: yesNo },
      { key: "occupiedHours", header: "Booked hours", width: 13, align: "right", map: num },
      { key: "availableHours", header: "Available hours", width: 15, align: "right", map: num },
      { key: "percent", header: "Used %", width: 9, align: "right", map: num },
    ],
  },
  "curriculum-completion": {
    name: "Curriculum completion",
    title: "Curriculum completion (required weekly hours scheduled per class)",
    columns: [
      { key: "name", header: "Class", width: 20 },
      { key: "curriculum", header: "Curriculum", width: 40 },
      { key: "yearLevel", header: "Year level", width: 10, align: "right", map: num },
      { key: "scheduledHours", header: "Scheduled hours", width: 15, align: "right", map: num },
      { key: "requiredHours", header: "Required hours", width: 14, align: "right", map: num },
      { key: "remainingHours", header: "Remaining hours", width: 15, align: "right", map: num },
      { key: "percent", header: "Done %", width: 9, align: "right", map: num },
      { key: "subjects", header: "Subjects", width: 10, align: "right", map: num },
      { key: "incompleteSubjects", header: "Subjects still open", width: 18, align: "right", map: num },
    ],
  },
  "scheduling-gaps": {
    name: "Scheduling gaps",
    title: "Scheduling gaps (class subjects that still need hours)",
    columns: [
      { key: "className", header: "Class", width: 20 },
      { key: "yearLevel", header: "Year level", width: 10, align: "right", map: num },
      { key: "subjectCode", header: "Code", width: 14 },
      { key: "subjectName", header: "Subject", width: 40 },
      { key: "scheduledHours", header: "Scheduled hours", width: 15, align: "right", map: num },
      { key: "requiredHours", header: "Required hours", width: 14, align: "right", map: num },
      { key: "remainingHours", header: "Remaining hours", width: 15, align: "right", map: num },
      { key: "status", header: "Status", width: 16, map: (v) => (v === "unscheduled" ? "Not scheduled" : "Partly scheduled") },
      { key: "hasEligibleFaculty", header: "Faculty set for subject", width: 22, map: yesNo },
    ],
  },
  projection: {
    name: "Projection",
    title: "Projected scheduling (estimate only; faculty caps and room limits, not real time slots)",
    columns: [
      { key: "className", header: "Class", width: 20 },
      { key: "subjectCode", header: "Code", width: 14 },
      { key: "subjectName", header: "Subject", width: 40 },
      { key: "remainingHours", header: "Remaining hours", width: 15, align: "right", map: num },
      { key: "outcome", header: "Estimate", width: 22, map: (v) => OUTCOME[String(v)] ?? str(v) },
    ],
  },
  conflicts: {
    name: "Conflicts",
    title: "Schedule conflicts (double bookings found in the saved schedule)",
    columns: [
      { key: "type", header: "Type", width: 10, map: (v) => (typeof v === "string" ? v.charAt(0).toUpperCase() + v.slice(1) : null) },
      { key: "entity", header: "Double-booked", width: 32 },
      { key: "dayOfWeek", header: "Day", width: 8, map: (v) => DAYS[Number(v)] ?? null },
      { key: "first", header: "One booking", width: 44 },
      { key: "second", header: "Other booking", width: 44 },
      { key: "detail", header: "Involved", width: 36 },
    ],
  },
};

const FILL = {
  header: "FFF2F2F2",
  over: "FFFDE8E8",
  under: "FFFEF3C7",
  full: "FFDCFCE7",
  unset: "FFF3F4F6",
};
const border = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };
const sheetCaption = (ctx: { academicYear: string; semester: number; scope: string }) =>
  `${ctx.scope} · ${ctx.academicYear} · ${["", "1st semester", "2nd semester", "Mid year"][ctx.semester] ?? ""} · exported ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;

async function loadRows(caller: DashboardCaller, metric: Metric, query: ExportQuery) {
  const q: AnalyticsQuery = { ...query, metric, page: 1, pageSize: 1_000_000 } as AnalyticsQuery;
  const result = await getDashboardAnalytics(caller, q);
  return { rows: result.rows as Record<string, unknown>[], context: result.context };
}

function addTable(ws: ExcelJS.Worksheet, spec: (typeof SHEETS)[Metric], metric: Metric, rows: Record<string, unknown>[], caption: string) {
  ws.columns = spec.columns.map((c) => ({ key: c.key, width: c.width }));
  ws.mergeCells(1, 1, 1, spec.columns.length);
  ws.getCell(1, 1).value = spec.title;
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.mergeCells(2, 1, 2, spec.columns.length);
  ws.getCell(2, 1).value = caption;
  ws.getCell(2, 1).font = { size: 9, color: { argb: "FF6B7280" } };
  const headerRow = 4;
  spec.columns.forEach((c, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", horizontal: c.align ?? "left", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL.header } };
    cell.border = border;
  });
  rows.forEach((row, r) => {
    spec.columns.forEach((c, i) => {
      const raw = row[c.key];
      const cell = ws.getCell(headerRow + 1 + r, i + 1);
      cell.value = c.map ? c.map(raw, row) : (raw as Cell) ?? null;
      cell.border = border;
      cell.alignment = { vertical: "middle", horizontal: c.align ?? "left", wrapText: true };
    });
    if (metric === "faculty-workload") {
      const state = String(row.state) as keyof typeof FILL;
      const fill = FILL[state];
      if (fill) {
        for (const key of ["difference", "state"]) {
          const idx = spec.columns.findIndex((c) => c.key === key) + 1;
          ws.getCell(headerRow + 1 + r, idx).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        }
      }
    }
  });
  if (rows.length === 0) {
    ws.mergeCells(headerRow + 1, 1, headerRow + 1, spec.columns.length);
    ws.getCell(headerRow + 1, 1).value = "Nothing to show for these filters.";
    ws.getCell(headerRow + 1, 1).font = { italic: true, color: { argb: "FF6B7280" } };
  } else {
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + rows.length, column: spec.columns.length } };
  }
  ws.views = [{ state: "frozen", ySplit: headerRow }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: `${headerRow}:${headerRow}` };
}

async function addSummarySheet(wb: ExcelJS.Workbook, caller: DashboardCaller, query: ExportQuery, caption: string) {
  const s = await getDashboardSummary(caller, query.academicYearId, query.semester);
  const ws = wb.addWorksheet("Summary");
  ws.columns = [{ width: 38 }, { width: 18 }, { width: 70 }];
  ws.mergeCells(1, 1, 1, 3);
  ws.getCell(1, 1).value = "Dashboard summary";
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.mergeCells(2, 1, 2, 3);
  ws.getCell(2, 1).value = caption;
  ws.getCell(2, 1).font = { size: 9, color: { argb: "FF6B7280" } };
  ["Metric", "Value", "Detail"].forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL.header } };
    c.border = border;
  });
  if (s.empty) {
    ws.getCell(5, 1).value = "No academic year is available.";
    return;
  }
  const k = s.kpis;
  const p = s.projection;
  const lines: [string, Cell, string][] = [
    ["Curriculum scheduled (%)", k.curriculum.percent, `${k.curriculum.scheduledHours} of ${k.curriculum.requiredHours} required hours per week`],
    ["Subjects complete", k.curriculum.completeSubjects, ""],
    ["Subjects partly scheduled", k.curriculum.partialSubjects, ""],
    ["Subjects not scheduled", k.curriculum.unscheduledSubjects, ""],
    ["Classes with no schedule", k.curriculum.classesWithNoSchedule, `of ${k.curriculum.classes} classes`],
    ["Faculty load used (%)", k.faculty.percent, `${k.faculty.assignedUnits} of ${k.faculty.maxUnits} allowed units (maximum less deloading)`],
    ["Faculty in overload", k.faculty.over, "More units than the maximum less deloading"],
    ["Faculty in underload", k.faculty.under, "Fewer units than the maximum less deloading"],
    ["Faculty fully loaded", k.faculty.full, ""],
    ["Faculty with no maximum set", k.faculty.unset, "Overload and underload cannot be judged"],
    ["Faculty with no load", k.faculty.withoutLoad, `of ${k.faculty.total} people who can carry a load`],
    ["Room use (%)", k.rooms.percent, `${k.rooms.occupiedHours} of ${k.rooms.availableHours} room-hours (${s.context.roomWindow})`],
    ["Scheduling gaps", k.gaps.count, `${k.gaps.noEligibleFaculty} with no faculty set; ${k.gaps.pendingRequests} pending requests`],
    ["Schedule conflicts", k.conflicts.total, `${k.conflicts.faculty} faculty, ${k.conflicts.room} room, ${k.conflicts.class} class`],
    ["Projection: scheduled now (%)", p.currentPercent, "Estimate"],
    ["Projection: if remaining hours are scheduled (%)", p.projectedPercent, p.note],
    ["Projection: hours left", p.remainingHours, ""],
    ["Projection: hours that could be placed", p.schedulableHours, ""],
    ["Projection: hours blocked", p.unresolvedHours, `No faculty set ${p.unresolved.noFaculty.hours} h, faculty at cap ${p.unresolved.facultyCap.hours} h, no room fits ${p.unresolved.noRoom.hours} h, rooms booked ${p.unresolved.noRoomHours.hours} h`],
  ];
  lines.forEach(([m, v, d], i) => {
    const r = 5 + i;
    ws.getCell(r, 1).value = m;
    ws.getCell(r, 2).value = v;
    ws.getCell(r, 2).alignment = { horizontal: "right" };
    ws.getCell(r, 3).value = d || null;
    for (let c = 1; c <= 3; c++) ws.getCell(r, c).border = border;
  });
  const alertsStart = 5 + lines.length + 1;
  ws.getCell(alertsStart, 1).value = "Needs action";
  ws.getCell(alertsStart, 1).font = { bold: true };
  (s.alerts ?? []).forEach((a, i) => {
    ws.getCell(alertsStart + 1 + i, 1).value = a.title;
    ws.getCell(alertsStart + 1 + i, 2).value = a.count;
    ws.getCell(alertsStart + 1 + i, 3).value = a.detail;
  });
  ws.views = [{ state: "frozen", ySplit: 4 }];
}

function csvEscape(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface ExportFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/** Builds the dashboard export: one workbook with every metric, or one metric as a sheet or CSV. */
export async function buildDashboardExport(caller: DashboardCaller, query: ExportQuery): Promise<ExportFile> {
  if (query.format === "csv" && query.metric === "all") throw badRequest("CSV can export one metric at a time. Pick a metric, or use Excel for all of them.");
  const metrics: Metric[] = query.metric === "all" ? [...METRICS] : [query.metric];

  const loaded = new Map<Metric, Awaited<ReturnType<typeof loadRows>>>();
  for (const m of metrics) loaded.set(m, await loadRows(caller, m, query));
  const ctx = loaded.get(metrics[0])!.context;
  const scope = caller.role === "CHAIRMAN" ? "Your department" : "College of Engineering";
  const caption = sheetCaption({ academicYear: ctx.academicYear.name, semester: ctx.semester, scope });
  const base = `${ctx.academicYear.name}-S${ctx.semester}`.replace(/[^\w.-]+/g, "_");

  if (query.format === "csv") {
    const m = metrics[0];
    const spec = SHEETS[m];
    const rows = loaded.get(m)!.rows;
    const lines = [spec.columns.map((c) => csvEscape(c.header)).join(",")];
    for (const row of rows) lines.push(spec.columns.map((c) => csvEscape(c.map ? c.map(row[c.key], row) : ((row[c.key] as Cell) ?? null))).join(","));
    return {
      buffer: Buffer.from("﻿" + lines.join("\r\n") + "\r\n", "utf8"),
      filename: `dashboard-${m}-${base}.csv`,
      contentType: "text/csv; charset=utf-8",
    };
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "COE.Vantage";
  if (query.metric === "all") await addSummarySheet(wb, caller, query, caption);
  for (const m of metrics) addTable(wb.addWorksheet(SHEETS[m].name), SHEETS[m], m, loaded.get(m)!.rows, caption);
  const buf = (await wb.xlsx.writeBuffer()) as Buffer | ArrayBuffer;
  return {
    buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
    filename: query.metric === "all" ? `dashboard-${base}.xlsx` : `dashboard-${query.metric}-${base}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
