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
  department?: { id: string; name: string; code: string | null };
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
  curriculumId: string | null;
  departmentId: string | null;
  curriculum?: { id: string; name: string; code: string | null } | null;
  department?: { id: string; name: string; code: string | null } | null;
  deletedAt?: string | null;
}

export interface StudentClass {
  id: string;
  name: string;
  yearLevel: number;
  curriculumId: string;
  studentCount: number;
  curriculum?: { id: string; name: string; code: string | null };
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
  department?: { name: string; code: string | null } | null;
  deletedAt?: string | null;
}

export interface FacultyLoad {
  id: string;
  facultyId: string;
  subjectId: string;
  studentClassId: string;
  roomId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  semester: number;
  academicYearId: string;
  faculty?: { id: string; name: string; email: string };
  subject?: { id: string; code: string; name: string; units: number; isLab: boolean };
  studentClass?: { id: string; name: string; yearLevel: number; studentCount: number };
  room?: { id: string; name: string; capacity: number; isLab: boolean };
  academicYear?: { id: string; name: string };
}

export interface ConflictPreview {
  facultyConflict: boolean;
  roomConflict: boolean;
  studentConflict: boolean;
  capacityIssue: boolean;
  labRoomMismatch: boolean;
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
