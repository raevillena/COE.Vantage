import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { StudentClass } from "../../types/api";
import toast from "react-hot-toast";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";

export function StudentClassesPage() {
  const [list, setList] = useState<StudentClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", yearLevel: 1, curriculumId: "", studentCount: 0 });
  const [curricula, setCurricula] = useState<{ id: string; name: string }[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", yearLevel: 1, curriculumId: curricula[0]?.id ?? "", studentCount: 0 });
    setModalOpen(true);
  };

  const openEdit = (c: StudentClass) => {
    setEditingId(c.id);
    setForm({ name: c.name, yearLevel: c.yearLevel, curriculumId: c.curriculumId, studentCount: c.studentCount });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.curriculumId) {
      toast.error("Select a curriculum");
      return;
    }
    try {
      if (editingId) {
        await apiClient.patch(`/student-classes/${editingId}`, form);
        toast.success("Student class updated");
      } else {
        await apiClient.post("/student-classes", form);
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

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-foreground">Student Classes</h1>
        <Button type="button" onClick={openCreate}>Add Student Class</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No student classes yet. Add one to get started.</p>
          <Button type="button" onClick={openCreate}>Add Student Class</Button>
        </div>
      ) : (
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Year Level</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Student Count</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Curriculum</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-foreground">{c.name}</td>
                  <td className="px-4 py-2 text-foreground-muted">{c.yearLevel}</td>
                  <td className="px-4 py-2 text-foreground-muted">{c.studentCount}</td>
                  <td className="px-4 py-2 text-foreground-muted">{c.curriculum?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button type="button" className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" aria-label="Actions">
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18" r="1.5" /></svg>
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content align="end">
                        <DropdownMenu.Item onSelect={() => openEdit(c)}>Edit</DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => handleDeleteClick(c.id)} className="text-danger focus:bg-danger-muted focus:text-danger-hover">Move to trash</DropdownMenu.Item>
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
        <Dialog.Content title={editingId ? "Edit Student Class" : "Add Student Class"}>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <input required placeholder="Name (e.g. BSCE-3A)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            <input required type="number" min={1} placeholder="Year level" value={form.yearLevel} onChange={(e) => setForm((f) => ({ ...f, yearLevel: Number(e.target.value) }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            <input required type="number" min={0} placeholder="Student count" value={form.studentCount} onChange={(e) => setForm((f) => ({ ...f, studentCount: Number(e.target.value) }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
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
    </div>
  );
}
