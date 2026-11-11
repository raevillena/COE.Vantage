import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarPlus, Printer } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import { apiUrl } from "../../utils/apiUrl";

type Block = {
  id: string;
  dayOfWeek: number;
  day: string;
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectName: string;
  room: string | null;
  className: string;
  faculty: string | null;
};
type PublicSchedule = { title: string; kind: "FACULTY" | "CLASS"; term: string | null; blocks: Block[] };

const time12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** Read-only schedule behind a share link (/s/:token). Works on a phone: one card per day, in time order. */
export function PublicSchedulePage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<PublicSchedule | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "gone" | "busy">("loading");

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<PublicSchedule>(`/public/schedule/${encodeURIComponent(token)}`)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setState("ready");
      })
      .catch((err: { response?: { status?: number } }) => !cancelled && setState(err.response?.status === 429 ? "busy" : "gone"));
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (data) document.title = `${data.title} - COE Vantage`;
  }, [data]);

  const byDay = useMemo(() => {
    const map = new Map<number, Block[]>();
    for (const b of data?.blocks ?? []) map.set(b.dayOfWeek, [...(map.get(b.dayOfWeek) ?? []), b]);
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [data]);

  const calendarHref = apiUrl(`/public/schedule/${encodeURIComponent(token)}/calendar.ics`);

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-surface px-4 py-6 text-foreground">
      {state === "loading" && <p className="text-sm text-foreground-muted">Loading the schedule…</p>}
      {state === "gone" && (
        <div role="alert">
          <h1 className="text-xl font-semibold">This link is not active</h1>
          <p className="mt-2 text-sm text-foreground-muted">It may have been turned off or may have expired. Ask the person who shared it for a new one.</p>
        </div>
      )}
      {state === "busy" && <p role="alert" className="text-sm text-foreground-muted">Too many requests. Please wait a few minutes and try again.</p>}
      {state === "ready" && data && (
        <>
          <header className="mb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">COE Vantage</p>
            <h1 className="text-2xl font-semibold">{data.title}</h1>
            <p className="text-sm text-foreground-muted">{data.term ?? "No semester is set yet"}</p>
            <div className="mt-3 flex flex-wrap gap-2 print:hidden">
              <a href={calendarHref} className="inline-flex items-center gap-1.5 rounded border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-hover">
                <CalendarPlus size={16} aria-hidden /> Add to calendar
              </a>
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-hover">
                <Printer size={16} aria-hidden /> Print
              </button>
            </div>
          </header>
          {byDay.length === 0 ? (
            <p className="text-sm text-foreground-muted">There are no classes scheduled yet.</p>
          ) : (
            <div className="space-y-4">
              {byDay.map(([day, blocks]) => (
                <section key={day} aria-label={blocks[0].day} className="overflow-hidden rounded border border-border bg-surface">
                  <h2 className="border-b border-border bg-surface-muted px-3 py-1.5 text-sm font-semibold">{blocks[0].day}</h2>
                  <ul className="divide-y divide-border">
                    {blocks.map((b) => (
                      <li key={b.id} className="px-3 py-2 text-sm">
                        <p className="font-medium">
                          {time12(b.startTime)} - {time12(b.endTime)}
                        </p>
                        <p>
                          {b.subjectCode} <span className="text-foreground-muted">{b.subjectName}</span>
                        </p>
                        <p className="text-xs text-foreground-muted">
                          {[b.room, data.kind === "FACULTY" ? b.className : b.faculty].filter(Boolean).join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <p className="mt-6 text-xs text-foreground-muted">Shows the current semester and updates when the schedule changes.</p>
        </>
      )}
    </main>
  );
}
