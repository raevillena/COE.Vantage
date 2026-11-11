import { useEffect, useState } from "react";
import { useReloadTick } from "../../context/PageReloadContext";
import { Link } from "react-router-dom";
import { apiClient } from "../../api/apiClient";
import { DaysLeftBadge, deadlineWhen, type CollegeDeadline } from "../../pages/deadlines/DeadlinesPage";

/** The next few college deadlines, on the dashboard. Shows nothing when there are none. */
export function UpcomingDeadlines() {
  const [items, setItems] = useState<CollegeDeadline[]>([]);
  const reloadTick = useReloadTick();
  useEffect(() => {
    apiClient
      .get<CollegeDeadline[]>("/college-deadlines")
      .then(({ data }) => setItems(data.filter((d) => new Date(d.dueAt).getTime() >= Date.now()).slice(0, 4)))
      .catch(() => setItems([]));
  }, [reloadTick]);
  if (items.length === 0) return null;
  return (
    <section className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-sm" aria-label="Upcoming deadlines">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-medium text-foreground">Upcoming deadlines</h2>
        <Link to="/deadlines" className="rounded text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring">
          See all
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {items.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
            <span className="min-w-0">
              <span className="font-medium text-foreground">{d.title}</span>
              <span className="ml-2 text-xs text-foreground-muted">{deadlineWhen(d.dueAt)}</span>
            </span>
            <DaysLeftBadge dueAt={d.dueAt} />
          </li>
        ))}
      </ul>
    </section>
  );
}
