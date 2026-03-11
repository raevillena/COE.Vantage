import type { Role } from "./auth";

export interface Department {
  id: string;
  name: string;
  code: string | null;
  deletedAt?: string | null;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  hasComputer: boolean;
  isLab: boolean;
  hasAC: boolean;
  departmentId: string;
  controlDepartmentId?: string | null;
  department?: { id: string; name: string; code: string | null };
  controlDepartment?: { id: string; name: string; code: string | null } | null;
  deletedAt?: string | null;
}

export interface Curriculum {
  id: string;
  name: string;
  code: string | null;
  departmentId: string | null;
  department?: { id: string; name: string; code: string | null } | null;
  deletedAt?: string | null;
}

/** Extracted or to-apply subject row from curriculum import (no id). */
export interface ExtractedSubject {
  yearLevel: number;
  semester?: number;
  code: string;
  name: string;
  units: number;
  prerequisites?: string;
  isLab?: boolean;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  units: number;
  isLab: boolean;
  /** Recommended year level within its curriculum; nullable when not assigned. */
  yearLevel?: number | null;
  /** 1 = 1st sem, 2 = 2nd sem, 3 = mid year; nullable when not set. */
  semester?: number | null;
  curriculumId: string | null;
  departmentId: string | null;
  curriculum?: {
    id: string;
    name: string;
    code: string | null;
    department?: { id: string; name: string; code: string | null } | null;
  } | null;
  department?: { id: string; name: string; code: string | null } | null;
  deletedAt?: string | null;
}

export interface StudentClass {
  id: string;
  name: string;
  yearLevel: number;
  curriculumId: string;
  studentCount: number;
  curriculum?: {
    id: string;
    name: string;
    code: string | null;
    department?: { id: string; name: string; code: string | null };
  };
  deletedAt?: string | null;
}

export interface AcademicYear {
  id: string;
  name: string;
  isActive: boolean;
  deletedAt?: string | null;
}

export interface UserListItem {
  id: string;
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
  status?: string | null;
  maxUnits?: number | null;
  department?: { name: string; code: string | null } | null;
  deletedAt?: string | null;
}

export interface FacultyLoad {
  id: string;
  facultyId: string | null;
  subjectId: string;
  studentClassId: string;
  roomId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  semester: number;
  academicYearId: string;
  facultyDisplayName?: string | null;
  roomDisplayName?: string | null;
  faculty?: { id: string; name: string; email: string } | null;
  subject?: { id: string; code: string; name: string; units: number; isLab: boolean };
  studentClass?: { id: string; name: string; yearLevel: number; studentCount: number };
  room?: { id: string; name: string; capacity: number; isLab: boolean } | null;
  academicYear?: { id: string; name: string };
  /** True when this block is a pending cross-department request (not yet approved). */
  pendingApproval?: boolean;
}

/** Cross-department assignment request (chairman-to-chairman). */
export interface AssignmentRequest {
  id: string;
  facultyId: string;
  subjectId: string;
  studentClassId: string;
  roomId: string | null;
  roomDisplayName: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  semester: number;
  academicYearId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  faculty?: { id: string; name: string; email?: string; department?: { name: string } };
  subject?: { id: string; code: string; name: string; units?: number; isLab?: boolean };
  studentClass?: { id: string; name: string };
  room?: { id: string; name: string; capacity?: number; isLab?: boolean } | null;
  requestedBy?: { id: string; name: string; department?: { name: string } };
  academicYear?: { id: string; name: string };
  respondedById?: string | null;
  respondedAt?: string | null;
  notes?: string | null;
  createdAt?: string;
}

export interface ConflictPreview {
  facultyConflict: boolean;
  roomConflict: boolean;
  studentConflict: boolean;
  capacityIssue: boolean;
  labRoomMismatch: boolean;
}

export interface CopyFacultyLoadSummary {
  subjectCode: string;
  subjectName: string;
  facultyName: string | null;
  roomName: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface CopySkippedFacultyLoadSummary extends CopyFacultyLoadSummary {
  reason: string;
}

export interface CopyFacultyLoadsSummary {
  copied: CopyFacultyLoadSummary[];
  skipped: CopySkippedFacultyLoadSummary[];
}

/** One assigned block from auto-schedule (same shape as copy summary for display). */
export interface AutoAssignAssignedItem {
  subjectCode: string;
  subjectName: string;
  facultyName: string;
  roomName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/** One subject that could not be fully scheduled by auto-assign. */
export interface AutoAssignSkippedItem {
  subjectCode: string;
  subjectName: string;
  reason: string;
}

export interface AutoAssignSummary {
  assigned: AutoAssignAssignedItem[];
  skipped: AutoAssignSkippedItem[];
}

/** Config for a scheduling rule set (auto-schedule behavior). */
export interface SchedulingRuleSetConfig {
  workStartMinutes: number;
  workEndMinutes: number;
  lunchStartMinutes: number;
  lunchEndMinutes: number;
  slotStepMinutes: number;
  avoidLunchSpan: boolean;
  preferMwfFor3UnitLecture: boolean;
  preferTthFor3UnitLecture: boolean;
  requireLabBreakAfterLongLab: boolean;
  preferRandom3DayFor3UnitLecture?: boolean;
  maxBlockMinutes: number;
  /** Days to avoid for assignment (1=Mon … 6=Sat). Default often includes Friday [5]. */
  excludedDays?: number[];
}

export interface SchedulingRuleSet {
  id: string;
  name: string;
  description: string | null;
  config: SchedulingRuleSetConfig;
  departmentId: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Resolved rule set for (academic year, class). */
export interface ResolvedSchedulingRuleSet {
  ruleSetId: string | null;
  ruleSetName?: string | null;
  config: SchedulingRuleSetConfig | null;
}

export interface SchedulingRuleSetAssignment {
  id: string;
  academicYearId: string | null;
  studentClassId: string | null;
  ruleSetId: string;
  ruleSet?: { id: string; name: string };
  academicYear?: { id: string; name: string } | null;
  studentClass?: { id: string; name: string } | null;
}

/** Build a short conflict summary for toasts (e.g. "Room is in use. Faculty has another class."). */
export function getConflictSummary(preview: ConflictPreview): string {
  const parts: string[] = [];
  if (preview.roomConflict) parts.push("Room is in use at this time");
  if (preview.facultyConflict) parts.push("Faculty has another class at this time");
  if (preview.studentConflict) parts.push("Student class has another class at this time");
  if (preview.capacityIssue) parts.push("Room capacity is less than class size");
  if (preview.labRoomMismatch) parts.push("Lab subject must use a lab room");
  return parts.length ? parts.join(". ") : "Conflicts detected";
}

/** Get user-friendly error message from API error (e.g. move/resize/save). */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return (typeof msg === "string" && msg.trim()) ? msg.trim() : fallback;
}
