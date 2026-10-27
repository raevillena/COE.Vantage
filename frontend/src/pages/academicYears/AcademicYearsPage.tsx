import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { AcademicYear } from "../../types/api";
import toast from "react-hot-toast";
import { MoreVertical, Pencil } from "lucide-react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";
import { HelpTip } from "../../components/ui/helpTip";
import { useAppSelector } from "../../store/hooks";
import { currentTerm } from "../../utils/currentTerm";

const SEMESTER_LABEL: Record<number, string> = { 1: "1st Sem", 2: "2nd Sem", 3: "Mid Year" };

export function AcademicYearsPage() {
  const role = useAppSelector((s) => s.auth.user?.role);
  // The college secretary sets the current term but cannot add, edit or delete academic years.
  const canManage = role === "ADMIN";
  const [termYearId, setTermYearId] = useState("");
  const [termSemester, setTermSemester] = useState(1);
  const [termSaving, setTermSaving] = useState(false);
  const [list, setList] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", isActive: false });
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
      const term = currentTerm(data);
      setTermYearId(term?.academicYearId ?? "");
      setTermSemester(term?.semester ?? 1);
    } catch {
      toast.error("Failed to load academic years");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", isActive: false });
    setModalOpen(true);
  };

  const openEdit = (y: AcademicYear) => {
    setEditingId(y.id);
    setForm({ name: y.name, isActive: y.isActive });
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
        await apiClient.patch(`/academic-years/${editingId}`, { ...form, name: nameTrimmed });
        toast.success("Academic year updated");
      } else {
        await apiClient.post("/academic-years", { ...form, name: nameTrimmed });
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
    if (!termYearId) return;
    setTermSaving(true);
    try {
      await apiClient.put("/academic-years/current-term", { academicYearId: termYearId, semester: termSemester });
      toast.success("Current term saved");
      await load();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Could not save the current term");
    } finally {
      setTermSaving(false);
    }
  };

  const activeYear = list.find((y) => y.isActive);
  const termChanged = !!termYearId && (termYearId !== activeYear?.id || termSemester !== (activeYear?.currentSemester ?? 1));

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
          (y.isActive ? "yes" : "no").includes(searchLower)
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
        <h1 className="text-2xl font-semibold text-foreground">Academic Years</h1>
        {canManage && <Button type="button" onClick={openCreate}>Add Academic Year</Button>}
      </div>

      {list.length > 0 && (
        <section className="mb-5 rounded border border-border bg-surface p-4" aria-label="Current term">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">Current term</h2>
            <HelpTip>
              The academic year and semester that filters across the system open on, such as the dashboard, schedules, scheduler, rooms and reports. Users can still pick another term in each filter. Choosing a year here also makes it the active academic year.
            </HelpTip>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">
            {activeYear ? `${activeYear.name}, ${SEMESTER_LABEL[activeYear.currentSemester ?? 1]}` : "No active academic year."}
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
                disabled={termSaving}
                className="rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>{SEMESTER_LABEL[n]}</option>
                ))}
              </select>
            </div>
            <Button type="button" onClick={saveCurrentTerm} disabled={termSaving || !termChanged}>
              {termSaving ? "Saving…" : "Set as current term"}
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
          {canManage && selectedIds.size > 0 && (
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
                {canManage && (
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
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Active</th>
                {canManage && <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredList.map((y) => (
                <tr key={y.id} className={selectedIds.has(y.id) ? "bg-primary-muted/30" : ""}>
                  {canManage && (
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
                  <td className="px-4 py-2 text-foreground-muted">{y.isActive ? `Yes, ${SEMESTER_LABEL[y.currentSemester ?? 1]}` : "No"}</td>
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
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded border-border-strong focus:ring-focus-ring" />
              <span>Set as active (only one can be active)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button type="submit">Save</Button>
            </div>
          </form>
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
