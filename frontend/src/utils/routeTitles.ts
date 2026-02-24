/** Map pathname to page title for app bar */
export const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/users": "Manage Users",
  "/rooms": "Manage Rooms",
  "/curriculum": "Manage Curriculum",
  "/subjects": "Manage Subjects",
  "/student-classes": "Manage Student Classes",
  "/academic-years": "Academic Years",
  "/scheduler": "Scheduler",
  "/schedules/faculty": "Faculty Schedule",
  "/schedules/student-class": "Class Schedule",
  "/schedules/rooms": "Room Availability",
  "/reports": "Reports",
};

export function getPageTitle(pathname: string): string {
  const normalized = pathname.replace(/\/$/, "") || "/";
  return routeTitles[normalized] ?? "COE.Vantage";
}
