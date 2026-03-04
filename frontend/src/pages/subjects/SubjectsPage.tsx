import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { Subject } from "../../types/api";
import toast from "react-hot-toast";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";

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
  const [priorityList, setPriorityList] = useState<{ facultyId: string; name: string; email: string; priority: number }[]>([]);
  const [allFaculty, setAllFaculty] = useState<{ id: string; name: string; email: string }[]>([]);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [prioritySaving, setPrioritySaving] = useState(false);

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
    setPriorityLoading(true);
    try {
      const [priRes, facRes] = await Promise.all([
        apiClient.get<{ facultyId: string; name: string; email: string; priority: number }[]>(`/subjects/${s.id}/prioritized-faculty`),
        apiClient.get<{ id: string; name: string; email: string }[]>("/users?role=FACULTY"),
      ]);
      setPriorityList(priRes.data ?? []);
      setAllFaculty(facRes.data ?? []);
    } catch {
      toast.error("Failed to load");
      setPrioritySubject(null);
    } finally {
      setPriorityLoading(false);
    }
  };

  const addToPriority = (facultyId: string) => {
    const f = allFaculty.find((x) => x.id === facultyId);
    if (!f || priorityList.some((p) => p.facultyId === facultyId)) return;
    setPriorityList((prev) => [...prev, { facultyId: f.id, name: f.name, email: f.email, priority: prev.length }]);
  };

  const removeFromPriority = (facultyId: string) => {
    setPriorityList((prev) => prev.filter((p) => p.facultyId !== facultyId).map((p, i) => ({ ...p, priority: i })));
  };

  const movePriority = (index: number, direction: "up" | "down") => {
    setPriorityList((prev) => {
      const next = [...prev];
      const j = direction === "up" ? index - 1 : index + 1;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next.map((p, i) => ({ ...p, priority: i }));
    });
  };

  const savePriority = async () => {
    if (!prioritySubject) return;
    setPrioritySaving(true);
    try {
      await apiClient.put(`/subjects/${prioritySubject.id}/prioritized-faculty`, {
        facultyIds: priorityList.map((p) => p.facultyId),
      });
      toast.success("Prioritized faculty updated");
      setPrioritySubject(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    } finally {
      setPrioritySaving(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-foreground">Subjects</h1>
        <Button type="button" onClick={openCreate}>Add Subject</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No subjects yet. Add one to get started.</p>
          <Button type="button" onClick={openCreate}>Add Subject</Button>
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
              {list.map((s) => (
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

      <Dialog.Root open={prioritySubject !== null} onOpenChange={(open) => !open && setPrioritySubject(null)}>
        <Dialog.Content
          title={prioritySubject ? `Prioritized faculty — ${prioritySubject.code}` : "Prioritized faculty"}
          description="Auto-assign will only assign this subject to faculty in the list below. Order = priority (first = preferred)."
          className="max-w-lg"
        >
          {priorityLoading ? (
            <div className="flex justify-center py-8" aria-busy="true">
              <Spinner />
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Prioritized faculty (order = priority)</label>
                <div className="rounded border border-border bg-surface-muted/50 max-h-40 overflow-y-auto space-y-1 p-2">
                  {priorityList.length === 0 ? (
                    <p className="text-sm text-foreground-muted">None. Add faculty below.</p>
                  ) : (
                    priorityList.map((p, i) => (
                      <div key={p.facultyId} className="flex items-center justify-between gap-2 rounded border border-border bg-surface px-2 py-1.5 text-sm">
                        <span className="font-medium">{i + 1}. {p.name}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => movePriority(i, "up")} disabled={i === 0} className="rounded p-1 text-foreground-muted hover:bg-surface-hover disabled:opacity-50" aria-label="Move up">↑</button>
                          <button type="button" onClick={() => movePriority(i, "down")} disabled={i === priorityList.length - 1} className="rounded p-1 text-foreground-muted hover:bg-surface-hover disabled:opacity-50" aria-label="Move down">↓</button>
                          <button type="button" onClick={() => removeFromPriority(p.facultyId)} className="rounded p-1 text-danger hover:bg-danger-muted" aria-label="Remove">×</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Add faculty</label>
                <select
                  className="w-full rounded border border-border-strong px-3 py-2 text-sm bg-surface"
                  value=""
                  onChange={(e) => { const v = e.target.value; if (v) addToPriority(v); e.target.value = ""; }}
                >
                  <option value="">Select to add…</option>
                  {allFaculty
                    .filter((f) => !priorityList.some((p) => p.facultyId === f.id))
                    .map((f) => (
                      <option key={f.id} value={f.id}>{f.name} ({f.email})</option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary">Cancel</Button>
                </Dialog.Close>
                <Button type="button" onClick={savePriority} disabled={prioritySaving}>
                  {prioritySaving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Root>

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
