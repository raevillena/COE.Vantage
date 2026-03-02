export function AboutPage() {
  return (
    <div className="flex flex-col items-center">
      <h1 className="text-2xl font-semibold text-foreground mb-6">About</h1>
      <div className="rounded border border-border bg-surface p-6 max-w-2xl w-full space-y-4">
        <div>
          <h2 className="text-lg font-medium text-foreground mb-1">COE.Vantage</h2>
          <p className="text-foreground-muted">
            Faculty load scheduling system for the College of Engineering. Manage curricula, subjects,
            rooms, and assignments in one place.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground mb-1">Features</h3>
          <ul className="list-disc list-inside text-foreground-muted space-y-0.5 text-sm">
            <li>RBAC Dashboard</li>
            <li>Manage rooms, departments, curriculum, subjects, and student classes</li>
            <li>Faculty and class schedules, room availability</li>
            <li>Scheduler for assigning faculty loads</li>
            <li>Reports (faculty, class, room)</li>
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
