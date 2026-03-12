import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { AssignmentRequest, FacultyLoad } from "../../types/api";
import { getApiErrorMessage } from "../../types/api";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Select } from "../../components/ui/select";
import { Spinner } from "../../components/ui/spinner";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";
import { useAppSelector } from "../../store/hooks";

/** Map a request to a FacultyLoad for the schedule grid (shows as "Awaiting approval" when pending). */
function requestToDisplayLoad(r: AssignmentRequest): FacultyLoad {
  return {
    id: `pending-${r.id}`,
    facultyId: r.facultyId,
    subjectId: r.subjectId,
    studentClassId: r.studentClassId,
    roomId: r.roomId,
    roomDisplayName: r.roomDisplayName ?? null,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
    semester: r.semester,
    academicYearId: r.academicYearId,
    faculty: r.faculty ? { id: r.faculty.id, name: r.faculty.name, email: r.faculty.email ?? "" } : undefined,
    subject: r.subject ? { id: r.subject.id, code: r.subject.code, name: r.subject.name, units: r.subject.units ?? 0, isLab: r.subject.isLab ?? false } : undefined,
    studentClass: r.studentClass ? { id: r.studentClass.id, name: r.studentClass.name, yearLevel: 0, studentCount: 0 } : undefined,
    room: r.room ? { id: r.room.id, name: r.room.name, capacity: r.room.capacity ?? 0, isLab: r.room.isLab ?? false } : undefined,
    pendingApproval: r.status === "PENDING",
  };
}

const DAY_NAMES: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

function formatTime(r: AssignmentRequest): string {
  const day = DAY_NAMES[r.dayOfWeek] ?? `Day ${r.dayOfWeek}`;
  return `${day} ${r.startTime}–${r.endTime}`;
}

function roomDisplay(r: AssignmentRequest): string {
  if (r.room?.name) return r.room.name;
  if (r.roomDisplayName?.trim()) return r.roomDisplayName.trim();
  return "—";
}

export function RequestsPage() {
  const user = useAppSelector((s) => s.auth.user);
  const [list, setList] = useState<AssignmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [scopeFilter, setScopeFilter] = useState<"all" | "mine" | "other">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewRequest, setPreviewRequest] = useState<AssignmentRequest | null>(null);
  const [scheduleLoads, setScheduleLoads] = useState<FacultyLoad[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> =
        statusFilter && statusFilter !== "__all__" ? { status: statusFilter } : {};
      if (scopeFilter !== "all") params.scope = scopeFilter;
      const { data } = await apiClient.get<AssignmentRequest[]>("/assignment-requests", { params });
      setList(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter, scopeFilter]);

  // Fetch faculty schedule when preview dialog opens so the approver sees the faculty's week with the request block.
  useEffect(() => {
    if (!previewRequest?.facultyId || !previewRequest?.academicYearId) {
      setScheduleLoads([]);
      return;
    }
    setScheduleLoading(true);
    const params = new URLSearchParams({
      facultyId: previewRequest.facultyId,
      academicYearId: previewRequest.academicYearId,
      semester: String(previewRequest.semester),
    });
    apiClient
      .get<FacultyLoad[]>(`/faculty-loads?${params}`)
      .then(({ data }) => setScheduleLoads(Array.isArray(data) ? data : []))
      .catch(() => setScheduleLoads([]))
      .finally(() => setScheduleLoading(false));
  }, [previewRequest?.id, previewRequest?.facultyId, previewRequest?.academicYearId, previewRequest?.semester]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await apiClient.post(`/assignment-requests/${id}/approve`, {});
      toast.success("Request approved");
      await load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Approve failed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      await apiClient.post(`/assignment-requests/${id}/reject`, {});
      toast.success("Request rejected");
      await load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Reject failed"));
    } finally {
      setActionLoading(null);
    }
  };

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredList = searchLower
    ? list.filter((r) => {
        const faculty = (r.faculty?.name ?? "").toLowerCase();
        const subjectCode = (r.subject?.code ?? "").toLowerCase();
        const subjectName = (r.subject?.name ?? "").toLowerCase();
        const studentClass = (r.studentClass?.name ?? "").toLowerCase();
        const room = (roomDisplay(r) ?? "").toLowerCase();
        const requestedBy = (r.requestedBy?.name ?? "").toLowerCase();
        const requestedByDept = (r.requestedBy?.department?.name ?? "").toLowerCase();
        const status = (r.status ?? "").toLowerCase();
        return (
          faculty.includes(searchLower) ||
          subjectCode.includes(searchLower) ||
          subjectName.includes(searchLower) ||
          studentClass.includes(searchLower) ||
          room.includes(searchLower) ||
          requestedBy.includes(searchLower) ||
          requestedByDept.includes(searchLower) ||
          status.includes(searchLower)
        );
      })
    : list;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">Assignment requests</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground-muted">View</span>
            <Select.Root value={scopeFilter} onValueChange={(v) => setScopeFilter(v as "all" | "mine" | "other")}>
              <Select.Trigger className="w-[160px]">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All requests</Select.Item>
                <Select.Item value="mine">My requests</Select.Item>
                <Select.Item value="other">Incoming requests</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground-muted">Status</span>
            <Select.Root value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
              <Select.Trigger className="w-[140px]">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="PENDING">Pending</Select.Item>
                <Select.Item value="APPROVED">Approved</Select.Item>
                <Select.Item value="REJECTED">Rejected</Select.Item>
                <Select.Item value="__all__">All</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
        </div>
      </div>

      <p className="text-sm text-foreground-muted">
        {scopeFilter === "mine" ? (
          <>Requests you created. Track their status here.</>
        ) : scopeFilter === "other" ? (
          <>Incoming requests for your department to approve or reject.</>
        ) : (
          <>All assignment requests, including yours and others. Use the view dropdown to filter.</>
        )}
      </p>

      {list.length > 0 && (
        <div className="relative max-w-md">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" aria-hidden>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </span>
          <input
            type="search"
            placeholder="Search by faculty, subject, class, room, status…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-border-strong py-2 pl-9 pr-3 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            aria-label="Search requests"
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-foreground-muted">
          No requests match the selected filter.
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No requests match &quot;{searchQuery.trim()}&quot;.</p>
          <button type="button" onClick={() => setSearchQuery("")} className="text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 rounded">
            Clear search
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover">
                <th className="px-3 py-2 text-left font-medium text-foreground">Faculty</th>
                <th className="px-3 py-2 text-left font-medium text-foreground">Subject</th>
                <th className="px-3 py-2 text-left font-medium text-foreground">Class</th>
                <th className="px-3 py-2 text-left font-medium text-foreground">Room</th>
                <th className="px-3 py-2 text-left font-medium text-foreground">Time</th>
                <th className="px-3 py-2 text-left font-medium text-foreground">Requested by</th>
                <th className="px-3 py-2 text-left font-medium text-foreground">Status</th>
                {scopeFilter !== "mine" && (statusFilter === "PENDING" || statusFilter === "__all__") && (
                  <th className="px-3 py-2 text-right font-medium text-foreground">Actions</th>
                )}
                <th className="px-3 py-2 text-right font-medium text-foreground w-20">Preview</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-foreground">{r.faculty?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-foreground">
                    {r.subject ? `${r.subject.code} ${r.subject.name}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-foreground">{r.studentClass?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-foreground">{roomDisplay(r)}</td>
                  <td className="px-3 py-2 text-foreground-muted">{formatTime(r)}</td>
                  <td className="px-3 py-2 text-foreground">
                    {r.requestedBy?.name ?? "—"}
                    {r.requestedBy?.department?.name && (
                      <span className="ml-1 text-foreground-muted">({r.requestedBy.department.name})</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        r.status === "PENDING"
                          ? "text-amber-600"
                          : r.status === "APPROVED"
                            ? "text-green-600"
                            : "text-red-600"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  {scopeFilter !== "mine" && (statusFilter === "PENDING" || statusFilter === "__all__") && (
                    <td className="px-3 py-2 text-right">
                      {r.status === "PENDING" && r.requestedBy?.id !== user?.id ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="primary"
                            disabled={actionLoading !== null}
                            onClick={() => handleApprove(r.id)}
                          >
                            {actionLoading === r.id ? <Spinner className="h-4 w-4" /> : "Approve"}
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={actionLoading !== null}
                            onClick={() => handleReject(r.id)}
                          >
                            {actionLoading === r.id ? <Spinner className="h-4 w-4" /> : "Reject"}
                          </Button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setPreviewRequest(r)}
                      className="text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 rounded"
                    >
                      Preview
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {previewRequest && (
        <Dialog.Root open={!!previewRequest} onOpenChange={(open) => !open && setPreviewRequest(null)}>
          <Dialog.Content
            title="Request details"
            className="!max-w-[min(60rem,95vw)] max-h-[90vh] overflow-hidden flex flex-col"
            aria-describedby="request-preview-description"
          >
            <p id="request-preview-description" className="sr-only">
              Request details and faculty schedule with this request shown as awaiting approval when pending.
            </p>

            {/* Scrollable area: schedule table + request details */}
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
            {/* Class schedule: confirmed loads + this request as "Awaiting approval" when pending */}
            <div className="mt-4">
              <h3 className="text-sm font-medium text-foreground mb-2">
                Faculty schedule: {previewRequest.faculty?.name ?? "—"}
                {previewRequest.academicYear?.name ? ` · ${previewRequest.academicYear.name}` : ""} · Sem {previewRequest.semester}
              </h3>
              {scheduleLoading ? (
                <div className="flex justify-center py-8 rounded border border-border bg-surface-muted/30">
                  <Spinner />
                </div>
              ) : (
                <div className="rounded border border-border overflow-x-auto">
                  <ScheduleGrid
                    loads={
                      previewRequest.status === "PENDING"
                        ? [...scheduleLoads, requestToDisplayLoad(previewRequest)]
                        : scheduleLoads
                    }
                    readOnly
                    wrapInScroll={false}
                    draggableIdPrefix="request-preview"
                  />
                </div>
              )}
            </div>

            <dl className="mt-6 space-y-2 text-sm border-t border-border pt-4">
              <div>
                <dt className="font-medium text-foreground-muted">Faculty</dt>
                <dd className="text-foreground">{previewRequest.faculty?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground-muted">Subject</dt>
                <dd className="text-foreground">
                  {previewRequest.subject ? `${previewRequest.subject.code} ${previewRequest.subject.name}` : "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground-muted">Class</dt>
                <dd className="text-foreground">{previewRequest.studentClass?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground-muted">Room</dt>
                <dd className="text-foreground">{roomDisplay(previewRequest)}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground-muted">Time</dt>
                <dd className="text-foreground">{formatTime(previewRequest)}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground-muted">Semester / Academic year</dt>
                <dd className="text-foreground">
                  {previewRequest.semester}
                  {previewRequest.academicYear?.name ? ` · ${previewRequest.academicYear.name}` : ""}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground-muted">Requested by</dt>
                <dd className="text-foreground">
                  {previewRequest.requestedBy?.name ?? "—"}
                  {previewRequest.requestedBy?.department?.name && (
                    <span className="text-foreground-muted"> ({previewRequest.requestedBy.department.name})</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground-muted">Status</dt>
                <dd>
                  <span
                    className={
                      previewRequest.status === "PENDING"
                        ? "text-amber-600"
                        : previewRequest.status === "APPROVED"
                          ? "text-green-600"
                          : "text-red-600"
                    }
                  >
                    {previewRequest.status}
                  </span>
                </dd>
              </div>
            </dl>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4 flex-shrink-0">
              {previewRequest.status === "PENDING" && previewRequest.requestedBy?.id !== user?.id ? (
                <>
                  <Dialog.Close asChild>
                    <Button type="button" variant="secondary">Cancel</Button>
                  </Dialog.Close>
                  <Button
                    variant="secondary"
                    disabled={actionLoading !== null}
                    onClick={async () => {
                      await handleReject(previewRequest.id);
                      setPreviewRequest(null);
                    }}
                  >
                    {actionLoading === previewRequest.id ? <Spinner className="h-4 w-4" /> : "Reject"}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={actionLoading !== null}
                    onClick={async () => {
                      await handleApprove(previewRequest.id);
                      setPreviewRequest(null);
                    }}
                  >
                    {actionLoading === previewRequest.id ? <Spinner className="h-4 w-4" /> : "Approve"}
                  </Button>
                </>
              ) : (
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary">Close</Button>
                </Dialog.Close>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Root>
      )}
    </div>
  );
}
