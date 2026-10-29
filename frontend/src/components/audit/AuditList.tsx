import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

export interface AuditEntry {
  id: string;
  createdAt: string;
  actorName: string;
  actorEmail: string | null;
  /** The role the person had when they made the change. */
  actorRole: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  action: string;
  summary: string;
  changes: Record<string, { from?: unknown; to?: unknown }> | null;
}

interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const ACTION_LABEL: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Changed",
  DELETE: "Deleted",
  RESTORE: "Restored",
  PERMANENT_DELETE: "Permanently deleted",
  LOCK: "Locked",
  UNLOCK: "Unlocked",
  SET_CURRENT_TERM: "Current term",
  OPEN: "Opened",
  CLOSE: "Closed",
  IMPORT: "Imported",
};

const ACTION_TONE: Record<string, string> = {
  CREATE: "bg-success-muted text-success",
  RESTORE: "bg-success-muted text-success",
  OPEN: "bg-success-muted text-success",
  DELETE: "bg-danger-muted text-danger",
  PERMANENT_DELETE: "bg-danger-muted text-danger",
  LOCK: "bg-warning-muted text-warning",
  CLOSE: "bg-warning-muted text-warning",
};

export const KIND_LABEL: Record<string, string> = {
  ACADEMIC_YEAR: "Academic year",
  CURRICULUM: "Curriculum",
  SUBJECT: "Subject",
  STUDENT_CLASS: "Student class",
  DEPARTMENT: "Department",
  ROOM: "Room",
  USER: "User",
  SCHEDULING_RULE: "Scheduling rule",
  SCHEDULE_BLOCK: "Schedule",
  GE_SHEET: "GE sheet",
  DELOADING: "Deloading",
  COLLEGE: "College",
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  DEAN: "Dean",
  CHAIRMAN: "Chairman",
  FACULTY: "Faculty",
  OFFICER: "Officer",
  COLLEGE_SECRETARY: "College secretary",
  PRESIDENT: "President",
  SYSTEM: "System",
};

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

const FIELD_LABEL: Record<string, string> = {
  isDeleted: "deleted",
  isActive: "active",
  lecUnits: "lecture units",
  labUnits: "laboratory units",
  yearLevel: "year level",
  departmentId: "department",
  curriculumId: "curriculum",
  maxUnits: "maximum units",
  currentTerm: "current term",
};

function ChangeList({ changes }: { changes: NonNullable<AuditEntry["changes"]> }) {
  return (
    <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 rounded-md bg-surface-muted/60 p-2 text-xs">
      {Object.entries(changes).map(([field, c]) => (
        <div key={field} className="contents">
          <dt className="font-medium text-foreground-muted">{FIELD_LABEL[field] ?? field}</dt>
          <dd className="min-w-0 break-words text-foreground">
            {"from" in c && <span className="text-foreground-muted line-through decoration-foreground-subtle">{show(c.from)}</span>}
            {"from" in c && "to" in c && <span className="mx-1.5 text-foreground-subtle">→</span>}
            {"to" in c && <span>{show(c.to)}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface AuditListProps {
  /** Comma-separated record kinds to show; leave out for every kind. */
  entityType?: string;
  entityId?: string;
  /** Let people pick the kind of record too (the full Audit log page). */
  kindFilter?: boolean;
}

/** Filterable, paged list of audit entries. Used by the Audit log page and by each page's History panel. */
export function AuditList({ entityType, entityId, kindFilter = false }: AuditListProps) {
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // the search box waits for a pause in typing
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const params = useCallback(
    () => ({
      ...((kind || entityType) ? { entityType: kind || entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(action ? { action } : {}),
      ...(search ? { q: search } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [kind, entityType, entityId, action, search, from, to]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiClient
      .get<AuditPage>("/audit", { params: { ...params(), page, pageSize: 25 } })
      .then(({ data: d }) => alive && setData(d))
      .catch(() => alive && toast.error("Could not load the history"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [params, page]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await apiClient.get<Blob>("/audit/export.csv", { params: params(), responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit-log.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not export the history");
    } finally {
      setExporting(false);
    }
  };

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const field = "rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1";

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <label htmlFor="audit-q" className="mb-1 block text-xs font-medium text-foreground-muted">Search</label>
          <input id="audit-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Person, record or text…" className={`w-full ${field}`} />
        </div>
        {kindFilter && (
          <div>
            <label htmlFor="audit-kind" className="mb-1 block text-xs font-medium text-foreground-muted">Record kind</label>
            <select id="audit-kind" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} className={field}>
              <option value="">All</option>
              {Object.entries(KIND_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="audit-action" className="mb-1 block text-xs font-medium text-foreground-muted">Action</label>
          <select id="audit-action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className={field}>
            <option value="">All</option>
            {Object.entries(ACTION_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-from" className="mb-1 block text-xs font-medium text-foreground-muted">From</label>
          <input id="audit-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={field} />
        </div>
        <div>
          <label htmlFor="audit-to" className="mb-1 block text-xs font-medium text-foreground-muted">To</label>
          <input id="audit-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={field} />
        </div>
        <Button type="button" variant="secondary" onClick={() => void exportCsv()} disabled={exporting || !data?.total} className="flex items-center gap-1.5 text-sm">
          <Download size={16} aria-hidden />
          Export CSV
        </Button>
      </div>

      <div className="mt-4" aria-busy={loading}>
        {loading && !data ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : data && data.items.length === 0 ? (
          <p className="rounded border border-border bg-surface px-4 py-8 text-center text-sm text-foreground-muted">Nothing has been recorded here yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded border border-border bg-surface">
            {data?.items.map((e) => {
              const isOpen = open.has(e.id);
              const hasChanges = e.changes && Object.keys(e.changes).length > 0;
              return (
                <li key={e.id} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${ACTION_TONE[e.action] ?? "bg-surface-muted text-foreground-muted"}`}>
                      {ACTION_LABEL[e.action] ?? e.action}
                    </span>
                    <p className="min-w-0 flex-1 text-sm text-foreground">{e.summary}</p>
                    <time dateTime={e.createdAt} className="shrink-0 text-xs text-foreground-muted">{formatWhen(e.createdAt)}</time>
                  </div>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    {e.actorName}
                    <span title="The role they had when they did it"> ({ROLE_LABEL[e.actorRole] ?? e.actorRole})</span>
                    {e.actorEmail ? ` · ${e.actorEmail}` : ""} · {KIND_LABEL[e.entityType] ?? e.entityType}
                  </p>
                  {hasChanges && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggle(e.id)}
                        aria-expanded={isOpen}
                        className="mt-1 inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring"
                      >
                        {isOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                        Details
                      </button>
                      {isOpen && <ChangeList changes={e.changes!} />}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <div className="mt-3 flex items-center justify-between text-sm text-foreground-muted">
          <span>{data.total} entries</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span>Page {page} of {totalPages}</span>
            <Button type="button" variant="secondary" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
