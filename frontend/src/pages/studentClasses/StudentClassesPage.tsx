import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { StudentClass } from "../../types/api";
import toast from "react-hot-toast";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { MoreVertical, Pencil } from "lucide-react";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";
import { HistoryButton } from "../../components/audit/HistoryButton";
import { useAppSelector } from "../../store/hooks";
import { parseClassName } from "../../utils/classNameParts";

export function StudentClassesPage() {
  /** The college secretary can view everything the dean can but never change it. */
  const role = useAppSelector((st) => st.auth.user?.role);
  const readOnly = role === "COLLEGE_SECRETARY" || role === "PRESIDENT" || role === "UNIT";
  const [list, setList] = useState<StudentClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; yearLevel: number | ""; curriculumId: string; specializationId: string; studentCount: number | "" }>({ name: "", yearLevel: 1, curriculumId: "", specializationId: "", studentCount: 0 });
  // The specializations of the curriculum chosen in the form (none = the curriculum has none).
  const [specializations, setSpecializations] = useState<{ id: string; name: string }[]>([]);
  const [curricula, setCurricula] = useState<{ id: string; name: string }[]>([]);
  // What the typed name says about the class, to warn when the year level field disagrees.
  const nameParts = parseClassName(form.name);
  const yearFromName = nameParts.yearLevel;
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<StudentClass[]>("/student-classes");
      setList(data);
    } catch {
      toast.error("Failed to load student classes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    apiClient.get("/curriculum").then(({ data }) => setCurricula(data));
  }, []);

  useEffect(() => {
    if (!form.curriculumId) {
      setSpecializations([]);
      return;
    }
    let cancelled = false;
    apiClient
      .get<{ id: string; name: string }[]>(`/curriculum/${form.curriculumId}/specializations`)
      .then(({ data }) => {
        if (cancelled) return;
        setSpecializations(data);
        // a specialization of another curriculum does not carry over
        setForm((f) => (f.specializationId && !data.some((s) => s.id === f.specializationId) ? { ...f, specializationId: "" } : f));
      })
      .catch(() => !cancelled && setSpecializations([]));
    return () => {
      cancelled = true;
    };
  }, [form.curriculumId]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", yearLevel: 1, curriculumId: curricula[0]?.id ?? "", specializationId: "", studentCount: 0 });
    setModalOpen(true);
  };

  const openEdit = (c: StudentClass) => {
    setEditingId(c.id);
    setForm({ name: c.name, yearLevel: c.yearLevel, curriculumId: c.curriculumId, specializationId: c.specializationId ?? "", studentCount: c.studentCount });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = form.name.trim();
    if (!nameTrimmed) {
      toast.error("Name is required");
      return;
    }
    // The number fields can be emptied while typing; an empty student count means none.
    const { yearLevel } = form;
    const studentCount = form.studentCount === "" ? 0 : form.studentCount;
    if (yearLevel === "" || yearLevel < 1 || yearLevel > 5) {
      toast.error("Year level must be between 1 and 5");
      return;
    }
    if (studentCount < 0) {
      toast.error("Student count cannot be negative");
      return;
    }
    if (!form.curriculumId) {
      toast.error("Select a curriculum");
      return;
    }
    try {
      if (editingId) {
        await apiClient.patch(`/student-classes/${editingId}`, { ...form, specializationId: form.specializationId || null, yearLevel, studentCount, name: nameTrimmed });
        toast.success("Student class updated");
      } else {
        await apiClient.post("/student-classes", { ...form, specializationId: form.specializationId || null, yearLevel, studentCount, name: nameTrimmed });
        toast.success("Student class created");
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    }
  };

  const handleDeleteClick = (id: string) => setDeleteConfirmId(id);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/student-classes/${deleteConfirmId}`);
      toast.success("Student class moved to trash");
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
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          String(c.yearLevel).includes(searchLower) ||
          String(c.studentCount).includes(searchLower) ||
          (c.curriculum?.name ?? "").toLowerCase().includes(searchLower) ||
          (c.specialization?.name ?? "").toLowerCase().includes(searchLower) ||
          (c.curriculum?.department?.name ?? "").toLowerCase().includes(searchLower)
      )
    : list;

  const filteredIds = filteredList.map((c) => c.id);
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
      const results = await Promise.allSettled(ids.map((id) => apiClient.delete(`/student-classes/${id}`)));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      load();
      if (failed === 0) toast.success(`${ok} class${ok === 1 ? "" : "es"} moved to trash`);
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
          <h1 className="text-2xl font-semibold text-foreground">Student Classes</h1>
          <HistoryButton entityType="STUDENT_CLASS" title="Student classes" />
        </div>
        {!readOnly && <Button type="button" onClick={openCreate}>Add Student Class</Button>}
      </div>
      {list.length > 0 && (
        <div className="mb-4 relative max-w-md">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" aria-hidden>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </span>
          <input
            type="search"
            placeholder="Search by name, year level, curriculum, or department…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-border-strong py-2 pl-9 pr-3 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            aria-label="Search student classes"
          />
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No student classes yet. Add one to get started.</p>
          {!readOnly && <Button type="button" onClick={openCreate}>Add Student Class</Button>}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No student classes match &quot;{searchQuery.trim()}&quot;.</p>
          <button type="button" onClick={() => setSearchQuery("")} className="text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 rounded">
            Clear search
          </button>
        </div>
      ) : (
        <>
          {!readOnly && selectedIds.size > 0 && (
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
                {!readOnly && (<th className="w-10 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && !allFilteredSelected; }}
                    onChange={toggleSelectAll}
                    aria-label="Select all on page"
                    className="rounded border-border-strong focus:ring-focus-ring"
                  />
                </th>)}
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Department</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Year Level</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Student Count</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Curriculum</th>
                {!readOnly && (<th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredList.map((c) => (
                <tr key={c.id} className={selectedIds.has(c.id) ? "bg-primary-muted/30" : ""}>
                  {!readOnly && (<td className="w-10 px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      aria-label={`Select ${c.name}`}
                      className="rounded border-border-strong focus:ring-focus-ring"
                    />
                  </td>)}
                  <td className="px-4 py-2 text-foreground">{c.name}</td>
                  <td className="px-4 py-2 text-foreground-muted">{c.curriculum?.department?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground-muted">{c.yearLevel}</td>
                  <td className="px-4 py-2 text-foreground-muted">{c.studentCount}</td>
                  <td className="px-4 py-2 text-foreground-muted">{c.curriculum?.name ?? "—"}{c.specialization ? <span className="ml-2 rounded-full bg-primary-muted px-2 py-0.5 text-xs font-medium text-primary">{c.specialization.name}</span> : null}</td>
                  {!readOnly && (<td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                        aria-label={`Edit ${c.name}`}
                        title="Edit"
                      >
                        <Pencil size={20} className="shrink-0" aria-hidden />
                      </button>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button type="button" className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" aria-label={`Actions for ${c.name}`}>
                            <MoreVertical size={20} className="shrink-0" aria-hidden />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="end">
                          <DropdownMenu.Item onSelect={() => openEdit(c)}>Edit</DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={() => handleDeleteClick(c.id)} className="text-danger focus:bg-danger-muted focus:text-danger-hover">Move to trash</DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
                    </div>
                  </td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Content title={editingId ? "Edit Student Class" : "Add Student Class"}>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div>
              <label htmlFor="student-class-name" className="mb-1 block text-sm font-medium text-foreground">Name</label>
              <input id="student-class-name" placeholder="e.g. BSCE-3A" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
              {nameParts.yearLevel !== null && (
                <p className="mt-1 text-[11px] text-foreground-muted">
                  Reads as year {nameParts.yearLevel}
                  {nameParts.section ? `, section ${nameParts.section}` : ""}
                  {nameParts.program ? ` of ${nameParts.program}` : ""}.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="student-class-year" className="mb-1 block text-sm font-medium text-foreground">Year level</label>
              <input id="student-class-year" type="number" min={1} max={5} placeholder="1–5" value={form.yearLevel} onChange={(e) => setForm((f) => ({ ...f, yearLevel: e.target.value === "" ? "" : Number(e.target.value) }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
              {yearFromName !== null && form.yearLevel !== "" && yearFromName !== form.yearLevel && (
                <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-warning bg-warning-muted px-3 py-2 text-sm text-warning">
                  <span>The name "{form.name.trim()}" reads as year {yearFromName}, but the year level is set to {form.yearLevel}.</span>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, yearLevel: yearFromName }))} className="font-medium underline underline-offset-2 hover:no-underline focus:outline-none focus:ring-2 focus:ring-focus-ring">
                    Use year {yearFromName}
                  </button>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="student-class-count" className="mb-1 block text-sm font-medium text-foreground">Student count</label>
              <input id="student-class-count" type="number" min={0} placeholder="0" value={form.studentCount} onChange={(e) => setForm((f) => ({ ...f, studentCount: e.target.value === "" ? "" : Number(e.target.value) }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Curriculum</label>
              <Select.Root value={form.curriculumId || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, curriculumId: v === "__none__" ? "" : v }))}>
                <Select.Trigger aria-label="Curriculum">
                  <Select.Value placeholder="Select curriculum" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="__none__">Select curriculum</Select.Item>
                  {curricula.map((c) => (
                    <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
            {specializations.length > 0 && (
              <div>
                <label htmlFor="student-class-specialization" className="mb-1 block text-sm font-medium text-foreground">Specialization</label>
                <select
                  id="student-class-specialization"
                  value={form.specializationId}
                  onChange={(e) => setForm((f) => ({ ...f, specializationId: e.target.value }))}
                  className="w-full rounded border border-border-strong bg-surface px-3 py-2 text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                >
                  <option value="">No specialization (takes every subject)</option>
                  {specializations.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-foreground-muted">A class with a specialization takes the curriculum's common subjects plus the subjects of that specialization.</p>
              </div>
            )}
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
        <Dialog.Content title="Move student class to trash" description="This student class will be moved to Trash. An admin can restore it or permanently delete it from the Trash page.">
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
        <Dialog.Content title="Move selected to trash" description={`${selectedIds.size} class${selectedIds.size === 1 ? "" : "es"} will be moved to Trash. You can restore them from the Trash page.`}>
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
