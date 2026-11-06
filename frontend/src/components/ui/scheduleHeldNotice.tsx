/** Shown to a faculty member in place of a schedule while their college has not finalised the term. */
export function ScheduleHeldNotice() {
  return (
    <div role="status" className="rounded border border-border bg-surface p-8 text-center">
      <p className="font-medium text-foreground">Schedules are not available yet</p>
      <p className="mt-1 text-sm text-foreground-muted">They appear here once your college finalises (locks) the term.</p>
    </div>
  );
}
