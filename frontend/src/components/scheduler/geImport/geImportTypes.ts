export interface GeRow {
  rowIndex: number;
  program: string;
  year: number | null;
  section: string;
  code: string;
  codeKey: string;
  title: string;
  lecUnits: number | null;
  labUnits: number | null;
  units: number | null;
  timeRaw: string;
  dayRaw: string;
  room: string;
  faculty: string;
  days: number[];
  startTime: string | null;
  endTime: string | null;
  timeInferred: boolean;
  coeFaculty: boolean;
  problems: string[];
}

export interface GeGroup {
  key: string;
  program: string;
  year: number | null;
  section: string;
  count: number;
}

export interface GeParsed {
  rows: GeRow[];
  groups: GeGroup[];
  warnings: string[];
}

export interface ClassSubject {
  id: string;
  code: string;
  codeKey: string;
  name: string;
  units: number;
  isLab: boolean;
  requiredMinutes: number;
  scheduledMinutes: number;
}

/** One block to create: a row of the file on one day. */
export interface ImportBlock {
  key: string;
  rowKey: string;
  subjectId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
  faculty: string;
  skip: boolean;
}

export interface BlockResult {
  key: string;
  state: "new" | "exists" | "skipped";
  blocking: string[];
  warnings: string[];
  roomId: string | null;
}

export interface PreviewResult {
  blocks: BlockResult[];
  subjects: { subjectId: string; code: string; requiredMinutes: number; existingMinutes: number; importMinutes: number }[];
  blockingCount: number;
  warningCount: number;
}

export const rowKey = (r: GeRow) => `r${r.rowIndex}`;

export const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const normalizeName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The file section that most likely is this class: "BSCpE", 1, "B" for the class named "BSCPE 1B". */
export function guessGroup(className: string, groups: GeGroup[]): string {
  const target = normalizeName(className);
  const hit = groups.find((g) => normalizeName(`${g.program}${g.year ?? ""}${g.section}`) === target);
  return hit?.key ?? "";
}

export const hoursLabel = (minutes: number) => `${Math.round((minutes / 60) * 100) / 100} h`;
