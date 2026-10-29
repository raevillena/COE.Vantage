import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { AcademicYear, College } from "../../types/api";
import toast from "react-hot-toast";
import { Lock, LockOpen, MoreVertical, Pencil } from "lucide-react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";
import { HelpTip } from "../../components/ui/helpTip";
import { useAppSelector } from "../../store/hooks";
import { getApiErrorMessage } from "../../types/api";
import { HistoryButton } from "../../components/audit/HistoryButton";

const SEMESTER_LABEL: Record<number, string> = { 1: "1st Sem", 2: "2nd Sem", 3: "Mid Year" };

export function AcademicYearsPage() {
  const role = useAppSelector((s) => s.auth.user?.role);
  // The college secretary adds and edits academic years and sets the current term; only the admin moves them to the trash.
  const isAdmin = role === "ADMIN";
  const canManage = isAdmin || role === "COLLEGE_SECRETARY";
  // The dean can lock and unlock semesters too, but changes nothing else here.
  const canLock = canManage || role === "DEAN";
  // the admin and president see every college's locks, one college at a time
  const spansColleges = role === "ADMIN" || role === "PRESIDENT";
  const showLocks = canLock || role === "PRESIDENT";
  const [colleges, setColleges] = useState<College[]>([]);
  const [lockCollegeId, setLockCollegeId] = useState("");
  const [lockTarget, setLockTarget] = useState<{ year: AcademicYear; semester: number; lock: boolean } | null>(null);
  const [lockSaving, setLockSaving] = useState(false);
  const [termYearId, setTermYearId] = useState("");
  const [termSemester, setTermSemester] = useState(1);
  const [termSaving, setTermSaving] = useState(false);
  const [list, setList] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "" });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<AcademicYear[]>("/academic-years");
      setList(data);
    } catch {
      toast.error("Failed to load academic years");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    apiClient
      .get<College[]>("/colleges")
      .then(({ data }) => {
        setColleges(data);
        setLockCollegeId((cur) => cur || data[0]?.id || "");
      })
      .catch(() => setColleges([]));
  }, []);

  const confirmLock = async () => {
    if (!lockTarget) return;
    setLockSaving(true);
    try {
      await apiClient.put(`/academic-years/${lockTarget.year.id}/term-lock`, { semester: lockTarget.semester, locked: lockTarget.lock, ...(role === "ADMIN" && lockCollegeId ? { collegeId: lockCollegeId } : {}) });
      toast.success(`${SEMESTER_LABEL[lockTarget.semester]} of ${lockTarget.year.name} ${lockTarget.lock ? "locked" : "unlocked"}`);
      setLockTarget(null);
      await load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Could not change the lock"));
    } finally {
      setLockSaving(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "" });
    setModalOpen(true);
  };

  const openEdit = (y: AcademicYear) => {
    setEditingId(y.id);
    setForm({ name: y.name });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = form.name.trim();
    if (!nameTrimmed) {
      toast.error("Name is required");
      return;
    }
    try {
      if (editingId) {
        await apiClient.patch(`/academic-years/${editingId}`, { name: nameTrimmed });
        toast.success("Academic year updated");
      } else {
        await apiClient.post("/academic-years", { name: nameTrimmed });
        toast.success("Academic year created");
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    }
  };

  const saveCurrentTerm = async () => {
    setTermSaving(true);
    try {
      await apiClient.put("/academic-years/current-term", {
        academicYearId: termYearId || null,
        ...(termYearId ? { semester: termSemester } : {}),
        ...(role === "ADMIN" && lockCollegeId ? { collegeId: lockCollegeId } : {}),
      });
      toast.success(termYearId ? "Current term saved" : "Marked as not started");
      await load();
      if (spansColleges) setColleges((await apiClient.get<College[]>("/colleges")).data);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Could not save the current term");
    } finally {
      setTermSaving(false);
    }
  };

  // The admin and president look at one college at a time; a college secretary has only their own.
  const shownCollege = spansColleges ? colleges.find((c) => c.id === lockCollegeId) : undefined;
  const currentYearId = spansColleges ? shownCollege?.currentAcademicYearId ?? "" : list.find((y) => y.isActive)?.id ?? "";
  const currentSem = spansColleges ? shownCollege?.currentSemester ?? 1 : list.find((y) => y.isActive)?.currentSemester ?? 1;
  const activeYear = list.find((y) => y.id === currentYearId);
  const termChanged = termYearId !== currentYearId || (!!termYearId && termSemester !== currentSem);
  const isCurrentRow = (y: AcademicYear) => (spansColleges && colleges.length > 0 ? y.id === currentYearId : y.isActive);
  const currentSemOf = (y: AcademicYear) => (spansColleges && colleges.length > 0 ? currentSem : y.currentSemester ?? 1);

  useEffect(() => {
    setTermYearId(currentYearId);
    setTermSemester(currentSem);
  }, [currentYearId, currentSem]);

  const handleDeleteClick = (id: string) => setDeleteConfirmId(id);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/academic-years/${deleteConfirmId}`);
      toast.success("Academic year moved to trash");
      setDeleteConfirmId(null);
      load();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteLoading(false);
    }
  };

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredList = searchLower
    ? list.filter(
        (y) =>
          y.name.toLowerCase().includes(searchLower) ||
          (isCurrentRow(y) ? "yes" : "no").includes(searchLower)
      )
    : list;

  const filteredIds = filteredList.map((y) => y.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...filteredIds]));
    }
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleteLoading(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => apiClient.delete(`/academic-years/${id}`)));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      load();
      if (failed === 0) toast.success(`${ok} academic year${ok === 1 ? "" : "s"} moved to trash`);
      else if (ok === 0) toast.error("Failed to move to trash");
      else toast.success(`${ok} moved to trash; ${failed} failed`);
    } catch {
      toast.error("Bulk delete failed");
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Academic Years</h1>
          <HistoryButton entityType="ACADEMIC_YEAR" title="Academic years" />
        </div>
        {canManage && <Button type="button" onClick={openCreate}>Add Academic Year</Button>}
      </div>

      {spansColleges && colleges.length > 1 && (
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor="lock-college" className="text-sm font-medium text-foreground">College</label>
          <select id="lock-college" value={lockCollegeId} onChange={(e) => setLockCollegeId(e.target.value)} className="rounded border border-border-strong bg-surface px-3 py-1.5 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1">
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {list.length > 0 && (
        <section className="mb-5 rounded border border-border bg-surface p-4" aria-label="Current term">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">Current term</h2>
            <HelpTip>
              The academic year and semester this college is scheduling now. Filters such as the dashboard, schedules, scheduler, rooms and reports open on it, and people can still pick another term. Each college sets its own, and can leave it as not started. Academic years themselves are shared.
            </HelpTip>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">
            {shownCollege ? `${shownCollege.name}: ` : ""}{activeYear ? `${activeYear.name}, ${SEMESTER_LABEL[currentSem]}` : "Not started: no current term."}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="term-year" className="mb-1 block text-xs font-medium text-foreground-muted">Academic year</label>
              <select
                id="term-year"
                value={termYearId}
                onChange={(e) => setTermYearId(e.target.value)}
                disabled={termSaving}
                className="rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              >
                <option value="">Not started</option>
                {list.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="term-sem" className="mb-1 block text-xs font-medium text-foreground-muted">Semester</label>
              <select
                id="term-sem"
                value={termSemester}
                onChange={(e) => setTermSemester(Number(e.target.value))}
                disabled={termSaving || !termYearId}
                className="rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>{SEMESTER_LABEL[n]}</option>
                ))}
              </select>
            </div>
            <Button type="button" onClick={saveCurrentTerm} disabled={termSaving || !termChanged}>
              {termSaving ? "Saving…" : termYearId ? "Set as current term" : "Mark as not started"}
            </Button>
          </div>
        </section>
      )}


      {list.length > 0 && (
        <div className="mb-4 relative max-w-md">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" aria-hidden>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </span>
          <input
            type="search"
            placeholder="Search by name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-border-strong py-2 pl-9 pr-3 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            aria-label="Search academic years"
          />
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">{canManage ? "No academic years yet. Add one to get started." : "No academic years yet."}</p>
          {canManage && <Button type="button" onClick={openCreate}>Add Academic Year</Button>}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No academic years match &quot;{searchQuery.trim()}&quot;.</p>
          <button type="button" onClick={() => setSearchQuery("")} className="text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 rounded">
            Clear search
          </button>
        </div>
      ) : (
        <>
          {isAdmin && selectedIds.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded border border-border bg-surface-muted/60 px-3 py-2">
              <span className="text-sm font-medium text-foreground">{selectedIds.size} selected</span>
              <Button type="button" variant="secondary" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </Button>
              <Button type="button" variant="danger" onClick={() => setBulkDeleteOpen(true)}>
                Move selected to trash
              </Button>
            </div>
          )}
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-muted">
              <tr>
                {isAdmin && (
                  <th className="w-10 px-2 py-2">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && !allFilteredSelected; }}
                      onChange={toggleSelectAll}
                      aria-label="Select all on page"
                      className="rounded border-border-strong focus:ring-focus-ring"
                    />
                  </th>
                )}
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Current term</th>
                {showLocks && (
                  <th className="px-4 py-2 text-left text-sm font-medium text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      Semester locks
                      <HelpTip>A locked semester takes no scheduling changes from anyone: blocks, auto-assign, copy, GE import, cross-department requests, deloading and room openings for that term. Unlock it to allow changes again.</HelpTip>
                    </span>
                  </th>
                )}
                {canManage && <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredList.map((y) => (
                <tr key={y.id} className={selectedIds.has(y.id) ? "bg-primary-muted/30" : ""}>
                  {isAdmin && (
                    <td className="w-10 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(y.id)}
                        onChange={() => toggleSelect(y.id)}
                        aria-label={`Select ${y.name}`}
                        className="rounded border-border-strong focus:ring-focus-ring"
                      />
                    </td>
                  )}
                  <td className="px-4 py-2 text-foreground">{y.name}</td>
                  <td className="px-4 py-2 text-foreground-muted">{isCurrentRow(y) ? `Yes, ${SEMESTER_LABEL[currentSemOf(y)]}` : "No"}</td>
                  {showLocks && (
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {[1, 2, 3].map((sem) => {
                          const lock = y.termLocks?.find((l) => l.semester === sem && (!spansColleges || l.collegeId === lockCollegeId));
                          return (
                            <button
                              key={sem}
                              type="button"
                              onClick={() => setLockTarget({ year: y, semester: sem, lock: !lock })}
                              disabled={!canLock}
                              aria-label={`${lock ? "Unlock" : "Lock"} ${SEMESTER_LABEL[sem]} of ${y.name}`}
                              aria-pressed={Boolean(lock)}
                              title={lock ? `Locked by ${lock.lockedByName}. Click to unlock.` : "Open for changes. Click to lock."}
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 ${
                                lock
                                  ? "border-warning/40 bg-warning-muted text-warning hover:bg-warning-muted/70"
                                  : "border-border text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                              }`}
                            >
                              {lock ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
                              {SEMESTER_LABEL[sem]}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  )}
                  {canManage && <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => openEdit(y)}
                        className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                        aria-label={`Edit ${y.name}`}
                        title="Edit"
                      >
                        <Pencil size={20} className="shrink-0" aria-hidden />
                      </button>
                      {isAdmin && (
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button type="button" className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" aria-label={`Actions for ${y.name}`}>
                            <MoreVertical size={20} className="shrink-0" aria-hidden />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="end">
                          <DropdownMenu.Item onSelect={() => openEdit(y)}>Edit</DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={() => handleDeleteClick(y.id)} className="text-danger focus:bg-danger-muted focus:text-danger-hover">Move to trash</DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
                      )}
                    </div>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Content title={editingId ? "Edit Academic Year" : "Add Academic Year"}>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <input placeholder="Name (e.g. 2025-2026)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            <p className="text-xs text-foreground-muted">Academic years are shared by every college, so each name exists once. Each college chooses its own current term.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={lockTarget !== null} onOpenChange={(open) => !open && !lockSaving && setLockTarget(null)}>
        <Dialog.Content
          title={lockTarget?.lock ? "Lock this semester?" : "Unlock this semester?"}
          description={
            lockTarget
              ? lockTarget.lock
                ? `${SEMESTER_LABEL[lockTarget.semester]} of ${lockTarget.year.name} will take no scheduling changes from anyone until it is unlocked: blocks, auto-assign, copy, GE import, cross-department requests, deloading and room openings.`
                : `${SEMESTER_LABEL[lockTarget.semester]} of ${lockTarget.year.name} can be changed again by the chairmen.`
              : undefined
          }
        >
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary" disabled={lockSaving}>Cancel</Button>
            </Dialog.Close>
            <Button type="button" onClick={() => void confirmLock()} disabled={lockSaving}>
              {lockSaving ? "…" : lockTarget?.lock ? "Lock semester" : "Unlock semester"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <Dialog.Content title="Move academic year to trash" description="This academic year will be moved to Trash. You can restore it from the Trash page, or permanently delete it there.">
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button type="button" variant="danger" onClick={handleDeleteConfirm} disabled={deleteLoading}>
              {deleteLoading ? "…" : "Move to trash"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <Dialog.Content title="Move selected to trash" description={`${selectedIds.size} academic year${selectedIds.size === 1 ? "" : "s"} will be moved to Trash. You can restore them from the Trash page.`}>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button type="button" variant="danger" onClick={handleBulkDeleteConfirm} disabled={bulkDeleteLoading}>
              {bulkDeleteLoading ? "…" : "Move to trash"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
