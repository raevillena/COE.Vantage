import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../api/apiClient";
import type { AcademicYear } from "../../types/api";
import { Select } from "../../components/ui/select";
import { SearchableSelect } from "../../components/ui/searchableSelect";
import { Spinner } from "../../components/ui/spinner";
import { HelpTip } from "../../components/ui/helpTip";
import { LOAD_STATE_BADGE } from "../../utils/loadState";
import { Button } from "../../components/ui/button";
import { currentTerm } from "../../utils/currentTerm";
import { downloadFromApi } from "../../utils/downloadFile";
import { MyWorkloadPanel } from "../../components/dashboard/MyWorkloadPanel";
import { useAppSelector } from "../../store/hooks";
import { isTeachingRole } from "../../utils/loadState";

interface Alert {
  id: string;
  severity: "high" | "medium" | "info";
  title: string;
  detail: string;
  count: number;
  to: string;
}

interface Summary {
  empty: boolean;
  context: { academicYear: { id: string; name: string } | null; semester: number; scope: string; roomWindow?: string };
  kpis?: {
    curriculum: {
      percent: number;
      scheduledHours: number;
      requiredHours: number;
      remainingHours: number;
      completeSubjects: number;
      partialSubjects: number;
      unscheduledSubjects: number;
      classes: number;
      classesWithNoSchedule: number;
    };
    faculty: {
      percent: number;
      assignedUnits: number;
      maxUnits: number;
      facultyWithCap: number;
      over: number;
      under: number;
      full: number;
      unset: number;
      withoutLoad: number;
      total: number;
    };
    conflicts: { total: number; faculty: number; room: number; class: number };
    rooms: { percent: number; occupiedHours: number; availableHours: number; rooms: number };
    gaps: { count: number; noEligibleFaculty: number; pendingRequests: number };
  };
  projection?: {
    currentPercent: number;
    projectedPercent: number;
    remainingHours: number;
    schedulableHours: number;
    unresolvedHours: number;
    unresolved: Record<"noFaculty" | "facultyCap" | "noRoom" | "noRoomHours", { subjects: number; hours: number }>;
    note: string;
  };
  alerts?: Alert[];
  moreAlerts?: number;
}

const SEVERITY_STYLE: Record<Alert["severity"], string> = {
  high: "border-danger/40 bg-danger-muted",
  medium: "border-warning/40 bg-warning-muted",
  info: "border-border bg-surface",
};

function Kpi({ label, value, sub, to }: { label: string; value: string; sub: string; to: string }) {
  return (
    <Link
      to={to}
      className="block rounded-lg border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2"
    >
      <p className="text-sm text-foreground-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-foreground-muted">{sub}</p>
    </Link>
  );
}

function Bar({ label, percent, tone }: { label: string; percent: number; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="tabular-nums text-foreground-muted">{percent}%</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded bg-surface-muted"
        role="img"
        aria-label={`${label}: ${percent} percent`}
      >
        <div className={`h-full rounded ${tone}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

/** Term overview for chairmen, deans and admins. One small request; details stay on their own pages. */
export function DashboardOverview() {
  const role = useAppSelector((s) => s.auth.user?.role);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    apiClient
      .get<AcademicYear[]>("/academic-years/for-schedules")
      .then(({ data: ys }) => {
        setYears(ys);
        const term = currentTerm(ys);
        if (term) {
          setAcademicYearId(term.academicYearId);
          setSemester(term.semester);
        } else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!academicYearId) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    apiClient
      .get<Summary>("/dashboard/summary", { params: { academicYearId, semester } })
      .then(({ data: d }) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [academicYearId, semester]);

  /** Carry the selected term into detail links so they show the same numbers. */
  const withTerm = (to: string) => {
    if (!to.startsWith("/dashboard/details/")) return to;
    const sep = to.includes("?") ? "&" : "?";
    return `${to}${sep}academicYearId=${academicYearId}&semester=${semester}`;
  };

  const k = data?.kpis;
  const p = data?.projection;

  return (
    <section className="mb-8" aria-labelledby="overview-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="overview-heading" className="text-sm font-medium uppercase tracking-wide text-foreground-muted">
            Term overview
          </h2>
          {data && <p className="text-sm text-foreground-muted">{data.context.scope}</p>}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-foreground-muted">Academic year</label>
            <SearchableSelect
              options={years.map((y) => ({ value: y.id, label: y.isActive ? `${y.name} (current)` : y.name }))}
              value={academicYearId || "__none__"}
              onValueChange={(v) => setAcademicYearId(v === "__none__" ? "" : v)}
              noneOption={{ value: "__none__", label: "Academic year" }}
              placeholder="Search academic year…"
              aria-label="Academic year"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground-muted">Semester</label>
            <Select.Root value={String(semester)} onValueChange={(v) => setSemester(Number(v))}>
              <Select.Trigger aria-label="Semester" className="w-[120px]">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="1">1st Sem</Select.Item>
                <Select.Item value="2">2nd Sem</Select.Item>
                <Select.Item value="3">Mid Year</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
        </div>
      </div>

      {academicYearId && !failed && (
        <div className="mb-3 flex items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={exporting || loading}
            onClick={async () => {
              setExporting(true);
              await downloadFromApi("/dashboard/export", { academicYearId, semester: String(semester), metric: "all" }, "dashboard.xlsx");
              setExporting(false);
            }}
          >
            {exporting ? "Preparing…" : "Export all metrics (Excel)"}
          </Button>
          <HelpTip>
            One workbook for the selected term: a summary sheet plus a table for faculty workload, room utilization, curriculum completion, scheduling gaps, the projection and schedule conflicts. It follows your role's scope.
          </HelpTip>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center rounded border border-border bg-surface py-10" aria-busy="true">
          <Spinner />
        </div>
      ) : failed ? (
        <p className="rounded border border-border bg-surface p-4 text-sm text-foreground-muted">
          The overview could not be loaded. The pages below still work.
        </p>
      ) : !data || data.empty || !k || !p ? (
        <p className="rounded border border-border bg-surface p-4 text-sm text-foreground-muted">
          No academic year is available yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Kpi
              label="Curriculum scheduled"
              value={`${k.curriculum.percent}%`}
              sub={`${k.curriculum.scheduledHours} of ${k.curriculum.requiredHours} required hrs/week`}
              to={withTerm("/dashboard/details/curriculum-completion")}
            />
            <Link
              to={withTerm("/dashboard/details/faculty-workload")}
              className="block rounded-lg border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2"
            >
              <p className="text-sm text-foreground-muted">Faculty load</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
                {k.faculty.facultyWithCap > 0 ? `${k.faculty.percent}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-foreground-muted">
                {k.faculty.facultyWithCap > 0
                  ? `${k.faculty.assignedUnits} of ${k.faculty.maxUnits} allowed units (maximum less deloading)`
                  : "No maximum units set"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium">
                <span className={`rounded px-1.5 py-0.5 ${LOAD_STATE_BADGE.over}`}>{k.faculty.over} overload</span>
                <span className={`rounded px-1.5 py-0.5 ${LOAD_STATE_BADGE.under}`}>{k.faculty.under} underload</span>
                <span className={`rounded px-1.5 py-0.5 ${LOAD_STATE_BADGE.full}`}>{k.faculty.full} full</span>
              </div>
            </Link>
            <Kpi
              label="Room use"
              value={`${k.rooms.percent}%`}
              sub={`${k.rooms.occupiedHours} of ${k.rooms.availableHours} room-hrs · ${data.context.roomWindow ?? ""}`}
              to={withTerm("/dashboard/details/room-utilization")}
            />
            <Kpi
              label="Scheduling gaps"
              value={String(k.gaps.count)}
              sub={`${k.curriculum.unscheduledSubjects} not scheduled · ${k.curriculum.partialSubjects} partial`}
              to={withTerm("/dashboard/details/scheduling-gaps")}
            />
            <Link
              to={withTerm("/dashboard/details/conflicts")}
              className="block rounded-lg border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2"
            >
              <p className="text-sm text-foreground-muted">Schedule conflicts</p>
              <p className={`mt-1 text-3xl font-semibold tabular-nums ${k.conflicts.total > 0 ? "text-danger" : "text-success"}`}>
                {k.conflicts.total}
              </p>
              <p className="mt-1 text-xs text-foreground-muted">
                {k.conflicts.total === 0
                  ? "No double bookings in the saved schedule"
                  : `${k.conflicts.faculty} faculty · ${k.conflicts.room} room · ${k.conflicts.class} class`}
              </p>
            </Link>
          </div>

          {isTeachingRole(role) && academicYearId && (
            <div className="mt-4">
              <MyWorkloadPanel academicYearId={academicYearId} semester={semester} variant="compact" />
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-1.5">
<h3 className="font-medium text-foreground">
                Projected completion</h3>
<HelpTip>{p.note}</HelpTip>
</div>
              <div className="space-y-3">
                <Bar label="Scheduled now" percent={p.currentPercent} tone="bg-primary" />
                <Bar label="Estimated if remaining hours are scheduled" percent={p.projectedPercent} tone="bg-primary/40" />
              </div>
              <p className="mt-3 text-sm text-foreground-muted">
                {p.remainingHours} hrs left · about {p.schedulableHours} could be placed · {p.unresolvedHours} blocked.
              </p>
              {p.unresolvedHours > 0 && (
                <ul className="mt-2 space-y-0.5 text-sm text-foreground-muted">
                  {(
                    [
                      ["noFaculty", "No faculty set for the subject"],
                      ["facultyCap", "Listed faculty have no unit cap left"],
                      ["noRoom", "No room fits (capacity or lab)"],
                      ["noRoomHours", "Suitable rooms are fully booked"],
                    ] as const
                  )
                    .filter(([k]) => p.unresolved[k].subjects > 0)
                    .map(([k, label]) => (
                      <li key={k}>
                        {label}: {p.unresolved[k].subjects} subjects, {p.unresolved[k].hours} hrs
                      </li>
                    ))}
                </ul>
              )}
              <Link
                to={withTerm("/dashboard/details/projection")}
                className="mt-2 inline-block rounded text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              >
                See subject-by-subject estimate
              </Link>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <h3 className="mb-3 font-medium text-foreground">Needs action</h3>
              {data.alerts && data.alerts.length > 0 ? (
                <ul className="space-y-2">
                  {data.alerts.map((a) => (
                    <li key={a.id}>
                      <Link
                        to={withTerm(a.to)}
                        className={`block rounded border p-3 focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 ${SEVERITY_STYLE[a.severity]}`}
                      >
                        <span className="block text-sm font-medium text-foreground">{a.title}</span>
                        <span className="block text-sm text-foreground-muted">{a.detail}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-foreground-muted">Nothing needs attention for this term.</p>
              )}
              {(data.moreAlerts ?? 0) > 0 && (
                <p className="mt-2 text-xs text-foreground-muted">+{data.moreAlerts} more lower-priority items.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
