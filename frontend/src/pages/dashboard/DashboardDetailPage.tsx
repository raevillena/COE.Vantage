import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiClient } from "../../api/apiClient";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { downloadFromApi } from "../../utils/downloadFile";
import { HelpTip } from "../../components/ui/helpTip";
import { LOAD_STATE_BADGE, LOAD_STATE_LABEL, ROLE_LABEL, type LoadState } from "../../utils/loadState";

type Metric = "faculty-workload" | "room-utilization" | "curriculum-completion" | "scheduling-gaps" | "projection" | "conflicts";

interface Column {
  key: string;
  label: string;
  align?: "right";
  render?: (row: Record<string, unknown>) => React.ReactNode;
}

interface FilterDef {
  param: string;
  label: string;
  options: { value: string; label: string }[];
}

interface MetricDef {
  title: string;
  blurb: string;
  columns: Column[];
  filters: FilterDef[];
  searchPlaceholder: string;
}

const text = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const percentCell = (v: unknown) => (v === null || v === undefined ? "—" : `${v}%`);

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const signed = (v: unknown) => (typeof v === "number" ? (v > 0 ? `+${v}` : String(v)) : "—");

const OUTCOME_LABEL: Record<string, string> = {
  schedulable: "Could be placed",
  "no-faculty": "No faculty set",
  "faculty-cap": "Faculty at unit cap",
  "no-room": "No room fits",
  "no-room-hours": "Rooms fully booked",
};

const METRICS: Record<Metric, MetricDef> = {
  projection: {
    title: "Projected scheduling (estimate)",
    blurb: "Whether each unscheduled subject could be placed within faculty unit caps and room limits. Nothing is saved.",
    searchPlaceholder: "Search class or subject…",
    filters: [
      {
        param: "outcome",
        label: "Show",
        options: [
          { value: "", label: "All" },
          { value: "schedulable", label: "Could be placed" },
          { value: "blocked", label: "Blocked by caps or rooms" },
          { value: "no-faculty", label: "No faculty set" },
          { value: "faculty-cap", label: "Faculty at unit cap" },
          { value: "no-room", label: "No room fits" },
          { value: "no-room-hours", label: "Rooms fully booked" },
        ],
      },
    ],
    columns: [
      { key: "className", label: "Class" },
      { key: "subjectCode", label: "Code" },
      { key: "subjectName", label: "Subject" },
      { key: "remainingHours", label: "Hrs left", align: "right" },
      {
        key: "outcome",
        label: "Estimate",
        render: (r) => (
          <span className={r.outcome === "schedulable" ? "text-foreground" : "text-warning"}>
            {OUTCOME_LABEL[String(r.outcome)] ?? text(r.outcome)}
          </span>
        ),
      },
    ],
  },
  "faculty-workload": {
    title: "Faculty workload",
    blurb: "Units assigned against each person's maximum less deloading. Laboratory units count 3x. Red is overload, amber underload, green fully loaded.",
    searchPlaceholder: "Search faculty or department…",
    filters: [
      {
        param: "state",
        label: "Status",
        options: [
          { value: "", label: "All" },
          { value: "over", label: "Overload" },
          { value: "under", label: "Underload" },
          { value: "full", label: "Fully loaded" },
          { value: "unset", label: "No maximum set" },
        ],
      },
    ],
    columns: [
      { key: "name", label: "Name", render: (r) => <span>{text(r.name)} <span className="text-xs text-foreground-muted">{ROLE_LABEL[String(r.role)] ?? ""}</span></span> },
      { key: "department", label: "Department" },
      { key: "status", label: "Employment", render: (r) => text(r.status) },
      { key: "maxUnits", label: "Max", align: "right", render: (r) => text(r.maxUnits) },
      {
        key: "deloadUnits",
        label: "Deloading",
        align: "right",
        render: (r) => (
          <span title={String(r.deloading ?? "")}>{Number(r.deloadUnits) > 0 ? `−${r.deloadUnits}` : "—"}</span>
        ),
      },
      { key: "effectiveMax", label: "Allowed", align: "right", render: (r) => text(r.effectiveMax) },
      { key: "assignedUnits", label: "Assigned", align: "right" },
      {
        key: "difference",
        label: "Difference",
        align: "right",
        render: (r) => <span className={LOAD_STATE_BADGE[r.state as LoadState] + " rounded px-1.5 py-0.5"}>{signed(r.difference)}</span>,
      },
      {
        key: "state",
        label: "Status",
        render: (r) => (
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${LOAD_STATE_BADGE[r.state as LoadState]}`}>
            {LOAD_STATE_LABEL[r.state as LoadState]}
          </span>
        ),
      },
    ],
  },
  conflicts: {
    title: "Schedule conflicts",
    blurb: "Double bookings found by scanning the saved schedule: a faculty member, room or class in two places at once.",
    searchPlaceholder: "Search faculty, room, class or subject…",
    filters: [
      {
        param: "type",
        label: "Type",
        options: [
          { value: "", label: "All" },
          { value: "faculty", label: "Faculty" },
          { value: "room", label: "Room" },
          { value: "class", label: "Class" },
        ],
      },
    ],
    columns: [
      { key: "type", label: "Type", render: (r) => <span className="rounded bg-danger-muted px-2 py-0.5 text-xs font-medium text-danger capitalize">{text(r.type)}</span> },
      { key: "entity", label: "Double-booked" },
      { key: "dayOfWeek", label: "Day", render: (r) => DAY[Number(r.dayOfWeek)] ?? "—" },
      { key: "first", label: "One booking" },
      { key: "second", label: "Other booking" },
      { key: "detail", label: "Involved" },
    ],
  },
  "room-utilization": {
    title: "Room utilization",
    blurb: "Booked hours against the weekly window of Mon–Sat, 7:00 AM–7:00 PM.",
    searchPlaceholder: "Search room or department…",
    filters: [],
    columns: [
      { key: "name", label: "Room" },
      { key: "department", label: "Department" },
      { key: "capacity", label: "Capacity", align: "right" },
      { key: "isLab", label: "Lab", render: (r) => (r.isLab ? "Yes" : "—") },
      { key: "occupiedHours", label: "Booked hrs", align: "right" },
      { key: "availableHours", label: "Available hrs", align: "right" },
      { key: "percent", label: "Used", align: "right", render: (r) => percentCell(r.percent) },
    ],
  },
  "curriculum-completion": {
    title: "Curriculum completion",
    blurb: "Required weekly hours already scheduled for each class. Lecture units are 1 hr, laboratory units 3 hrs.",
    searchPlaceholder: "Search class or curriculum…",
    filters: [
      {
        param: "status",
        label: "Show",
        options: [
          { value: "", label: "All" },
          { value: "incomplete", label: "Incomplete" },
          { value: "complete", label: "Complete" },
        ],
      },
    ],
    columns: [
      { key: "name", label: "Class" },
      { key: "curriculum", label: "Curriculum" },
      { key: "yearLevel", label: "Year", align: "right" },
      { key: "scheduledHours", label: "Scheduled hrs", align: "right" },
      { key: "requiredHours", label: "Required hrs", align: "right" },
      { key: "remainingHours", label: "Left", align: "right" },
      { key: "percent", label: "Done", align: "right", render: (r) => percentCell(r.percent) },
      { key: "incompleteSubjects", label: "Subjects open", align: "right" },
    ],
  },
  "scheduling-gaps": {
    title: "Scheduling gaps",
    blurb: "Class subjects that still need hours, for this year level and semester.",
    searchPlaceholder: "Search class or subject…",
    filters: [
      {
        param: "reason",
        label: "Show",
        options: [
          { value: "", label: "All" },
          { value: "unscheduled", label: "Not scheduled" },
          { value: "partial", label: "Partly scheduled" },
          { value: "no-faculty", label: "No faculty set" },
        ],
      },
    ],
    columns: [
      { key: "className", label: "Class" },
      { key: "subjectCode", label: "Code" },
      { key: "subjectName", label: "Subject" },
      { key: "scheduledHours", label: "Scheduled hrs", align: "right" },
      { key: "requiredHours", label: "Required hrs", align: "right" },
      { key: "remainingHours", label: "Left", align: "right" },
      { key: "status", label: "Status", render: (r) => (r.status === "unscheduled" ? "Not scheduled" : "Partial") },
      {
        key: "hasEligibleFaculty",
        label: "Faculty set",
        render: (r) => (r.hasEligibleFaculty ? "Yes" : <span className="text-warning">None</span>),
      },
    ],
  },
};

interface Result {
  context: { academicYear: { id: string; name: string }; semester: number };
  note: string;
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pages: number;
}

const PAGE_SIZE = 25;

/** Paginated rows behind one dashboard number. Filters live in the URL so alert links can deep-link. */
export function DashboardDetailPage() {
  const { metric } = useParams<{ metric: string }>();
  const def = metric ? METRICS[metric as Metric] : undefined;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState<null | "xlsx" | "csv">(null);

  const page = Number(params.get("page") ?? 1) || 1;
  const queryKey = params.toString();

  const apiParams = useMemo(() => {
    const out: Record<string, string> = { metric: metric ?? "", pageSize: String(PAGE_SIZE) };
    params.forEach((v, k) => {
      if (v) out[k] = v;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, queryKey]);

  useEffect(() => {
    if (!def) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    apiClient
      .get<Result>("/dashboard/analytics", { params: apiParams })
      .then(({ data: d }) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [def, apiParams]);

  // Debounce the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") === search.trim()) return;
      const next = new URLSearchParams(params);
      if (search.trim()) next.set("q", search.trim());
      else next.delete("q");
      next.delete("page");
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (!def) {
    return (
      <div>
        <p className="text-foreground-muted">Unknown dashboard view.</p>
        <Link to="/dashboard" className="text-primary hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  /** Exports every row for the current filters and search, not just the page on screen. */
  const exportRows = async (format: "xlsx" | "csv") => {
    setExporting(format);
    const filters: Record<string, string> = { metric: metric ?? "", format };
    params.forEach((v, k) => {
      if (v && k !== "page") filters[k] = v;
    });
    await downloadFromApi("/dashboard/export", filters, `dashboard-${metric}.${format}`);
    setExporting(null);
  };

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate("/dashboard")}
        className="mb-2 rounded text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
      >
        ← Dashboard
      </button>
      <div className="flex items-center gap-2">
<h1 className="text-2xl font-semibold text-foreground">
        {def.title}</h1>
<HelpTip>
          {def.blurb}
          {data ? ` ${data.note}` : ""}
        </HelpTip>
</div>
      <p className="mb-4 text-sm text-foreground-muted">
        {data ? `${data.context.academicYear.name}, ${["", "1st sem", "2nd sem", "Mid year"][data.context.semester]}` : ""}
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="order-last ml-auto flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={exporting !== null || loading} onClick={() => void exportRows("xlsx")}>
            {exporting === "xlsx" ? "Preparing…" : "Export Excel"}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={exporting !== null || loading} onClick={() => void exportRows("csv")}>
            {exporting === "csv" ? "Preparing…" : "Export CSV"}
          </Button>
          <HelpTip>Exports every row that matches the search and filters above, not only the current page.</HelpTip>
        </div>
        <div>
          <label htmlFor="detail-search" className="sr-only">
            Search
          </label>
          <input
            id="detail-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={def.searchPlaceholder}
            className="w-64 rounded border border-border-strong px-3 py-2 text-sm focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
          />
        </div>
        {def.filters.map((f) => (
          <div key={f.param}>
            <label htmlFor={`f-${f.param}`} className="mb-1 block text-xs font-medium text-foreground-muted">
              {f.label}
            </label>
            <select
              id={`f-${f.param}`}
              value={params.get(f.param) ?? ""}
              onChange={(e) => setParam(f.param, e.target.value)}
              className="rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center rounded border border-border bg-surface py-12" aria-busy="true">
          <Spinner />
        </div>
      ) : failed || !data ? (
        <p className="rounded border border-border bg-surface p-6 text-center text-foreground-muted">
          Could not load this view.
        </p>
      ) : data.rows.length === 0 ? (
        <p className="rounded border border-border bg-surface p-6 text-center text-foreground-muted">
          Nothing matches these filters.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded border border-border bg-surface">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-muted">
                <tr>
                  {def.columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      className={`px-3 py-2 font-medium text-foreground ${c.align === "right" ? "text-right" : "text-left"}`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((row, i) => (
                  <tr key={String(row.id ?? i)}>
                    {def.columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 tabular-nums text-foreground ${c.align === "right" ? "text-right" : ""}`}
                      >
                        {c.render ? c.render(row) : text(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-foreground-muted">
            <span>
              {data.total} {data.total === 1 ? "result" : "results"} · page {data.page} of {data.pages}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => setParam("page", String(page - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={data.page >= data.pages}
                onClick={() => setParam("page", String(page + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
