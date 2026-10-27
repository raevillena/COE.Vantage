export type FeedbackType = "BUG" | "CHANGE" | "IDEA";
export type FeedbackStatus = "NEW" | "PLANNED" | "DONE" | "DECLINED";

export interface FeedbackItem {
  id: string;
  page: string;
  type: FeedbackType;
  title: string;
  description: string;
  status: FeedbackStatus;
  adminNote: string | null;
  archivedAt: string | null;
  createdAt: string;
  imageCount: number;
  user: { id: string; name: string; role: string; department: { name: string; code: string | null } | null };
  images?: { id: string; mimeType: string; size: number; createdAt: string }[];
}

export interface FeedbackStorage {
  total: { count: number; bytes: number };
  purgeable: { count: number; bytes: number };
}

export const TYPE_LABEL: Record<FeedbackType, string> = { BUG: "Problem", CHANGE: "Change request", IDEA: "Idea" };
export const STATUS_LABEL: Record<FeedbackStatus, string> = { NEW: "New", PLANNED: "Planned", DONE: "Done", DECLINED: "Declined" };

export const STATUS_BADGE: Record<FeedbackStatus, string> = {
  NEW: "bg-primary-muted text-primary",
  PLANNED: "bg-warning-muted text-warning",
  DONE: "bg-success-muted text-success",
  DECLINED: "bg-surface-muted text-foreground-muted",
};

export const TYPE_BADGE: Record<FeedbackType, string> = {
  BUG: "bg-danger-muted text-danger",
  CHANGE: "bg-surface-muted text-foreground",
  IDEA: "bg-surface-muted text-foreground",
};

/** Pages and sections a user can attach feedback to. */
export const FEEDBACK_PAGES = [
  "Dashboard",
  "Scheduler",
  "Faculty schedule",
  "Class schedule",
  "Room availability",
  "Requests",
  "Rooms",
  "Departments",
  "Curriculum",
  "Subjects",
  "Student classes",
  "Faculty",
  "Users",
  "Academic years",
  "Scheduling rules",
  "Reports",
  "Profile",
  "Login",
  "Whole system / other",
] as const;
