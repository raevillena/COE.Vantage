import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { AssignmentRequest } from "../../types/api";
import { getApiErrorMessage } from "../../types/api";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { Spinner } from "../../components/ui/spinner";

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
  const [list, setList] = useState<AssignmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      // "__all__" = show all statuses (don't send status param); Radix Select forbids value=""
      const params = statusFilter && statusFilter !== "__all__" ? { status: statusFilter } : {};
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
  }, [statusFilter]);

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
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground-muted">Status</span>
          <Select.Root
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v)}
          >
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

      <p className="text-sm text-foreground-muted">
        Cross-department assignment requests. When a chairman assigns a faculty from another department, the request appears here for the faculty’s department chairman to approve or reject.
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
                {(statusFilter === "PENDING" || statusFilter === "__all__") && (
                  <th className="px-3 py-2 text-right font-medium text-foreground">Actions</th>
                )}
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
                  {(statusFilter === "PENDING" || statusFilter === "__all__") && (
                    <td className="px-3 py-2 text-right">
                      {r.status === "PENDING" ? (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
