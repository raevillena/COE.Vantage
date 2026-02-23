import type { Role } from "./auth";

export interface Department {
  id: string;
  name: string;
  code: string | null;
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
}

export interface Curriculum {
  id: string;
  name: string;
  code: string | null;
  departmentId: string | null;
  department?: { id: string; name: string; code: string | null } | null;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  units: number;
  isLab: boolean;
  curriculumId: string | null;
  departmentId: string | null;
}

export interface StudentClass {
  id: string;
  name: string;
  yearLevel: number;
  curriculumId: string;
  studentCount: number;
  curriculum?: { id: string; name: string; code: string | null };
}

export interface AcademicYear {
  id: string;
  name: string;
  isActive: boolean;
}

export interface UserListItem {
  id: string;
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
  department?: { name: string; code: string | null } | null;
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
