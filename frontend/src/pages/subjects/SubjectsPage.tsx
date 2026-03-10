import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { Subject } from "../../types/api";
import toast from "react-hot-toast";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";
import {
  PrioritizedFacultyModal,
  type FacultyWithDepartment,
  type PrioritizedFacultyItem,
} from "./PrioritizedFacultyModal";

export function SubjectsPage() {
  const [list, setList] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    units: 3,
    isLab: false,
    yearLevel: "",
    curriculumId: "",
    departmentId: "",
  });
  const [curricula, setCurricula] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [prioritySubject, setPrioritySubject] = useState<Subject | null>(null);
  const [priorityList, setPriorityList] = useState<PrioritizedFacultyItem[]>([]);
  const [allFaculty, setAllFaculty] = useState<FacultyWithDepartment[]>([]);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<Subject[]>("/subjects");
      setList(data);
    } catch {
      toast.error("Failed to load subjects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    apiClient.get("/curriculum").then(({ data }) => setCurricula(data));
    apiClient.get("/departments").then(({ data }) => setDepartments(data));
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", units: 3, isLab: false, yearLevel: "", curriculumId: "", departmentId: "" });
    setModalOpen(true);
  };

  const openEdit = (s: Subject) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      units: s.units,
      isLab: s.isLab,
      yearLevel: s.yearLevel != null ? String(s.yearLevel) : "",
      curriculumId: s.curriculumId ?? "",
      departmentId: s.departmentId ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = form.name.trim();
    if (!nameTrimmed) {
      toast.error("Name is required");
      return;
    }
    if (form.units < 0) {
      toast.error("Units cannot be negative");
      return;
    }
    try {
      // When creating, derive code from name (slug) so user doesn't have to type it; when editing, omit code to keep existing.
      const code =
        editingId
          ? undefined
          : (nameTrimmed.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").toUpperCase() || `SUB-${Date.now()}`).slice(0, 32);
      const payload = {
        ...(code !== undefined && { code }),
        name: nameTrimmed,
        units: form.units,
        isLab: form.isLab,
        yearLevel: form.yearLevel ? Number(form.yearLevel) : null,
        curriculumId: form.curriculumId || null,
        departmentId: form.departmentId || null,
      };
      if (editingId) {
        await apiClient.patch(`/subjects/${editingId}`, payload);
        toast.success("Subject updated");
      } else {
        await apiClient.post("/subjects", { ...payload, code: code! });
        toast.success("Subject created");
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
      await apiClient.delete(`/subjects/${deleteConfirmId}`);
      toast.success("Subject moved to trash");
      setDeleteConfirmId(null);
      load();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteLoading(false);
    }
  };

  const openPriorityModal = async (s: Subject) => {
    setPrioritySubject(s);
    setPriorityList([]);
    setAllFaculty([]);
    setPriorityLoading(true);
    try {
      const [priRes, facRes] = await Promise.all([
        apiClient.get<{ facultyId: string; name: string; email: string; priority: number }[]>(`/subjects/${s.id}/prioritized-faculty`),
        apiClient.get<FacultyWithDepartment[]>("/users?role=FACULTY"),
      ]);
      const pri = (priRes.data ?? []).map((p, i) => ({ ...p, priority: i }));
      setPriorityList(pri);
      setAllFaculty(facRes.data ?? []);
    } catch {
      toast.error("Failed to load");
      setPrioritySubject(null);
    } finally {
      setPriorityLoading(false);
    }
  };

  const savePriority = async (facultyIds: string[]) => {
    if (!prioritySubject) return;
    setPrioritySaving(true);
    try {
      await apiClient.put(`/subjects/${prioritySubject.id}/prioritized-faculty`, { facultyIds });
      toast.success("Prioritized faculty updated");
      setPrioritySubject(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    } finally {
      setPrioritySaving(false);
    }
  };

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredList = searchLower
    ? list.filter(
        (s) =>
          s.code.toLowerCase().includes(searchLower) ||
          s.name.toLowerCase().includes(searchLower) ||
          (s.curriculum?.name ?? "").toLowerCase().includes(searchLower) ||
          (s.department?.name ?? "").toLowerCase().includes(searchLower)
      )
    : list;

  return (
    <div>
      <div className="mb-4 flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Subjects</h1>
        <Button type="button" onClick={openCreate}>Add Subject</Button>
      </div>
      {list.length > 0 && (
        <div className="mb-4 relative max-w-md">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" aria-hidden>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </span>
          <input
            type="search"
            placeholder="Search by code, name, curriculum, or department…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-border-strong py-2 pl-9 pr-3 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            aria-label="Search subjects"
          />
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No subjects yet. Add one to get started.</p>
          <Button type="button" onClick={openCreate}>Add Subject</Button>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No subjects match &quot;{searchQuery.trim()}&quot;.</p>
          <button type="button" onClick={() => setSearchQuery("")} className="text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 rounded">
            Clear search
          </button>
        </div>
      ) : (
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Code</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Units</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Lab</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Year level</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredList.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 text-foreground">{s.code}</td>
                  <td className="px-4 py-2 text-foreground-muted">{s.name}</td>
                  <td className="px-4 py-2 text-foreground-muted">{s.units}</td>
                  <td className="px-4 py-2 text-foreground-muted">{s.isLab ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-foreground-muted">{s.yearLevel ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button type="button" className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" aria-label="Actions">
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18" r="1.5" /></svg>
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content align="end">
                        <DropdownMenu.Item onSelect={() => openEdit(s)}>Edit</DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => openPriorityModal(s)}>Set prioritized faculty</DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => handleDeleteClick(s.id)} className="text-danger focus:bg-danger-muted focus:text-danger-hover">Move to trash</DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Root>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Content title={editingId ? "Edit Subject" : "Add Subject"}>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {editingId && (
              <p className="text-sm text-foreground-muted">
                <span className="font-medium text-foreground">Code: </span>
                {list.find((s) => s.id === editingId)?.code ?? "—"}
              </p>
            )}
            <input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            <input type="number" min={0} placeholder="Units" value={form.units} onChange={(e) => setForm((f) => ({ ...f, units: Number(e.target.value) }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isLab} onChange={(e) => setForm((f) => ({ ...f, isLab: e.target.checked }))} className="rounded border-border-strong focus:ring-focus-ring" />
              <span>Lab subject</span>
            </label>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Year level (within curriculum)</label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 1, 2, 3, 4"
                value={form.yearLevel}
                onChange={(e) => setForm((f) => ({ ...f, yearLevel: e.target.value }))}
                className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              />
              <p className="mt-1 text-[11px] text-foreground-muted">
                Optional. Used to group subjects by year level in the scheduler for classes on this curriculum.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Curriculum</label>
              <Select.Root value={form.curriculumId || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, curriculumId: v === "__none__" ? "" : v }))}>
                <Select.Trigger aria-label="Curriculum">
                  <Select.Value placeholder="No curriculum" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="__none__">No curriculum</Select.Item>
                  {curricula.map((c) => (
                    <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Department</label>
              <Select.Root value={form.departmentId || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v === "__none__" ? "" : v }))}>
                <Select.Trigger aria-label="Department">
                  <Select.Value placeholder="No department" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="__none__">No department</Select.Item>
                  {departments.map((d) => (
                    <Select.Item key={d.id} value={d.id}>{d.name}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <PrioritizedFacultyModal
        subject={prioritySubject}
        open={prioritySubject !== null}
        onOpenChange={(open) => !open && setPrioritySubject(null)}
        initialPriorityList={priorityList}
        allFaculty={allFaculty}
        onSave={savePriority}
        saving={prioritySaving}
        loading={priorityLoading}
      />

      <Dialog.Root open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <Dialog.Content title="Move subject to trash" description="This subject will be moved to Trash. An admin can restore it or permanently delete it from the Trash page.">
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
    </div>
  );
}
