export function AboutPage() {
  return (
    <div className="flex flex-col items-center">
      <h1 className="text-2xl font-semibold text-foreground mb-6">About</h1>
      <div className="rounded border border-border bg-surface p-6 max-w-2xl w-full space-y-4">
        <div>
          <h2 className="text-lg font-medium text-foreground mb-1">Vantage</h2>
          <p className="text-foreground-muted">
            VANTAGE - Versatile Academic Navigator for Timetables and Assignment GEneration
          </p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground mb-1">Features</h3>
          <ul className="list-disc list-inside text-foreground-muted space-y-0.5 text-sm">
            <li>University with many colleges: each college keeps its own people, rooms, curriculum, schedules, current term and semester lock</li>
            <li>Role-based access for the admin, president, university viewers (UNIT), dean, college secretary, chairman, officer and faculty, with a college switcher for those who look across colleges</li>
            <li>Manage rooms, departments, curriculum, subjects (lecture and laboratory units), student classes and GE subjects</li>
            <li>Scheduler for assigning faculty loads, with conflict checks, scheduling rules and automatic scheduling</li>
            <li>Faculty and class schedules, room availability</li>
            <li>Room sharing: once a college locks a semester, other colleges can request its free room time. Chairmen draft, the college secretary submits, the room's chairman approves, then the host college secretary gives the final approval; deans view and are notified</li>
            <li>Semester locks per college and shared academic years</li>
            <li>Audit log of important changes, kept even when people change roles</li>
            <li>Notification bell, profile pictures, and what's-new release notes</li>
            <li>Reports (faculty, class, room, college workload) with Excel export</li>
          </ul>
        </div>
        <div className="pt-2 border-t border-border">
          <h3 className="text-sm font-medium text-foreground mb-1">Lead Developer</h3>
          <a
            href="https://github.com/raevillena"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
          >
            Raymart O. Villena
          </a>
          <p className="text-sm text-foreground-muted mt-0.5">Computer Engineering Department</p>
        </div>
      </div>
    </div>
  );
}
