import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../../api/apiClient";
import type { UserListItem } from "../../types/api";
import type { Subject } from "../../types/api";
import toast from "react-hot-toast";
import { ClipboardList, MoreVertical } from "lucide-react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";
import { SearchableSelect } from "../../components/ui/searchableSelect";

/** Subject row from GET /users/:id/prioritized-subjects (possible subjects to teach). */
interface PrioritizedSubjectItem {
  subjectId: string;
  priority: number;
  code: string;
  name: string;
  units: number;
  isLab: boolean;
}

/** Faculty list is filtered to chairman's department by the backend when role=FACULTY. */
export function ChairmanFacultyPage() {
  const [list, setList] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [possibleSubjectsUser, setPossibleSubjectsUser] = useState<UserListItem | null>(null);
  const [possibleSubjectsList, setPossibleSubjectsList] = useState<PrioritizedSubjectItem[]>([]);
  const [possibleSubjectsLoading, setPossibleSubjectsLoading] = useState(false);
  const [subjectsPool, setSubjectsPool] = useState<Subject[]>([]);
  const [addSubjectId, setAddSubjectId] = useState<string>("");
  const [savingSubject, setSavingSubject] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<UserListItem[]>("/users", {
        params: { role: "FACULTY" },
      });
      setList(data);
    } catch {
      toast.error("Failed to load faculty");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openPossibleSubjects = async (u: UserListItem) => {
    setPossibleSubjectsUser(u);
    setPossibleSubjectsList([]);
    setAddSubjectId("");
    setPossibleSubjectsLoading(true);
    try {
      const [subjectsRes, prioritizedRes] = await Promise.all([
        apiClient.get<Subject[]>("/subjects"),
        apiClient.get<PrioritizedSubjectItem[]>(`/users/${u.id}/prioritized-subjects`),
      ]);
      setSubjectsPool(subjectsRes.data ?? []);
      setPossibleSubjectsList(prioritizedRes.data ?? []);
    } catch {
      toast.error("Failed to load data");
      setPossibleSubjectsUser(null);
    } finally {
      setPossibleSubjectsLoading(false);
    }
  };

  const addPossibleSubject = async () => {
    if (!possibleSubjectsUser || !addSubjectId) return;
    setSavingSubject(true);
    try {
      const { data: current } = await apiClient.get<{ facultyId: string; name: string; email: string; priority: number }[]>(
        `/subjects/${addSubjectId}/prioritized-faculty`
      );
      const currentIds = (current ?? []).map((p) => p.facultyId);
      if (currentIds.includes(possibleSubjectsUser.id)) {
        toast("Faculty is already in the list for this subject.");
        setSavingSubject(false);
        return;
      }
      await apiClient.put(`/subjects/${addSubjectId}/prioritized-faculty`, {
        facultyIds: [...currentIds, possibleSubjectsUser.id],
      });
      const subject = subjectsPool.find((s) => s.id === addSubjectId);
      setPossibleSubjectsList((prev) => [
        ...prev,
        {
          subjectId: addSubjectId,
          priority: prev.length,
          code: subject?.code ?? "",
          name: subject?.name ?? "",
          units: subject?.units ?? 0,
          isLab: subject?.isLab ?? false,
        },
      ]);
      setAddSubjectId("");
      toast.success("Subject added");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to add subject";
      toast.error(msg);
    } finally {
      setSavingSubject(false);
    }
  };

  const removePossibleSubject = async (subjectId: string) => {
    if (!possibleSubjectsUser) return;
    setSavingSubject(true);
    try {
      const { data: current } = await apiClient.get<{ facultyId: string }[]>(
        `/subjects/${subjectId}/prioritized-faculty`
      );
      const nextIds = (current ?? []).map((p) => p.facultyId).filter((id) => id !== possibleSubjectsUser.id);
      await apiClient.put(`/subjects/${subjectId}/prioritized-faculty`, { facultyIds: nextIds });
      setPossibleSubjectsList((prev) => prev.filter((p) => p.subjectId !== subjectId));
      toast.success("Subject removed");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to remove subject";
      toast.error(msg);
    } finally {
      setSavingSubject(false);
    }
  };

  const filteredList = searchQuery.trim()
    ? list.filter(
        (u) =>
          u.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          (u.email && u.email.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      )
    : list;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Faculty</h1>
      </div>
      <p className="mb-4 text-sm text-foreground-muted">
        Department faculty. Set &quot;Possible subjects to teach&quot; to guide auto-assign: only faculty listed for a subject are considered for that subject.
      </p>

      {list.length > 0 && (
        <div className="mb-4">
          <label className="sr-only" htmlFor="faculty-search">Search faculty</label>
          <input
            id="faculty-search"
            type="search"
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-xs rounded border border-border-strong px-3 py-2 text-sm focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            aria-label="Search faculty"
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted">No faculty in your department.</p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted">No faculty match &quot;{searchQuery.trim()}&quot;.</p>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="mt-2 text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 rounded"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Email</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Department</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Max units</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredList.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-foreground">{u.name}</td>
                  <td className="px-4 py-2 text-foreground-muted">{u.email}</td>
                  <td className="px-4 py-2 text-foreground-muted">{u.department?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground-muted">{u.maxUnits != null ? u.maxUnits : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => openPossibleSubjects(u)}
                        className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                        aria-label={`Manage possible subjects for ${u.name}`}
                        title="Manage possible subjects to teach"
                      >
                        <ClipboardList size={20} className="shrink-0" aria-hidden />
                      </button>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                            aria-label={`Actions for ${u.name}`}
                          >
                            <MoreVertical size={20} className="shrink-0" aria-hidden />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="end">
                          <DropdownMenu.Item onSelect={() => openPossibleSubjects(u)}>
                            Manage possible subjects to teach
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog.Root
        open={possibleSubjectsUser !== null}
        onOpenChange={(open) => !open && setPossibleSubjectsUser(null)}
      >
        <Dialog.Content
          className="!max-w-2xl"
          title={`Possible subjects to teach — ${possibleSubjectsUser?.name ?? ""}`}
          description="Subjects this faculty can be assigned to in auto-assign. Add or remove below; same data is used when setting prioritized faculty per subject on the Subjects page."
        >
          <div className="mt-4 space-y-4">
            {possibleSubjectsLoading ? (
              <div className="flex justify-center py-8" aria-busy="true">
                <Spinner />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1 basis-48">
                    <label className="mb-1 block text-sm font-medium text-foreground">Add subject</label>
                    <SearchableSelect
                      options={subjectsPool
                        .filter((s) => !possibleSubjectsList.some((p) => p.subjectId === s.id))
                        .map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
                      value={addSubjectId || "__none__"}
                      onValueChange={(v) => setAddSubjectId(v === "__none__" ? "" : v)}
                      placeholder="Search subject…"
                      noneOption={{ value: "__none__", label: "Select subject…" }}
                      disabled={savingSubject}
                      aria-label="Choose subject to add"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={addPossibleSubject}
                    disabled={!addSubjectId || savingSubject}
                  >
                    {savingSubject ? "…" : "Add"}
                  </Button>
                </div>

                {possibleSubjectsList.length === 0 ? (
                  <p className="py-4 text-center text-foreground-muted">
                    No possible subjects set. Add subjects above so auto-assign can consider this faculty for those subjects.
                  </p>
                ) : (
                  <div className="rounded border border-border overflow-hidden">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-surface-muted">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-foreground">#</th>
                          <th className="px-3 py-2 text-left font-medium text-foreground">Code</th>
                          <th className="px-3 py-2 text-left font-medium text-foreground">Subject</th>
                          <th className="px-3 py-2 text-left font-medium text-foreground">Units</th>
                          <th className="px-3 py-2 text-left font-medium text-foreground">Lab</th>
                          <th className="px-3 py-2 text-right font-medium text-foreground">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {possibleSubjectsList.map((row, idx) => (
                          <tr key={row.subjectId}>
                            <td className="px-3 py-2 text-foreground-muted">{idx + 1}</td>
                            <td className="px-3 py-2 text-foreground">{row.code}</td>
                            <td className="px-3 py-2 text-foreground">{row.name}</td>
                            <td className="px-3 py-2 text-foreground-muted">{row.units}</td>
                            <td className="px-3 py-2 text-foreground-muted">{row.isLab ? "Yes" : "—"}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removePossibleSubject(row.subjectId)}
                                disabled={savingSubject}
                                className="rounded p-1 text-foreground-muted hover:bg-danger-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-focus-ring disabled:opacity-50"
                                aria-label={`Remove ${row.code} from possible subjects`}
                              >
                                <span className="text-xs font-medium">Remove</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
