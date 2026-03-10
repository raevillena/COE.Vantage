import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { Room } from "../../types/api";
import toast from "react-hot-toast";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";
import { useAppSelector } from "../../store/hooks";

export function RoomsPage() {
  const user = useAppSelector((s) => s.auth.user);
  const canDeleteRoom = user?.role === "ADMIN" || user?.role === "DEAN";
  const [list, setList] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", capacity: 20, hasComputer: false, isLab: false, hasAC: false, departmentId: "", controlDepartmentId: "" });
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<Room[]>("/rooms");
      setList(data);
    } catch {
      toast.error("Failed to load rooms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    apiClient.get("/departments").then(({ data }) => setDepartments(data));
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", capacity: 20, hasComputer: false, isLab: false, hasAC: false, departmentId: departments[0]?.id ?? "", controlDepartmentId: "" });
    setModalOpen(true);
  };

  const openEdit = (r: Room) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      capacity: r.capacity,
      hasComputer: r.hasComputer,
      isLab: r.isLab,
      hasAC: r.hasAC,
      departmentId: r.departmentId,
      controlDepartmentId: r.controlDepartmentId ?? "",
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
    if (form.capacity < 1) {
      toast.error("Capacity must be at least 1");
      return;
    }
    if (!form.departmentId) {
      toast.error("Select a department");
      return;
    }
    try {
      const payload = {
        ...form,
        name: nameTrimmed,
        controlDepartmentId: form.controlDepartmentId || null,
      };
      if (editingId) {
        await apiClient.patch(`/rooms/${editingId}`, payload);
        toast.success("Room updated");
      } else {
        await apiClient.post("/rooms", payload);
        toast.success("Room created");
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
      await apiClient.delete(`/rooms/${deleteConfirmId}`);
      toast.success("Room moved to trash");
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
        (r) =>
          r.name.toLowerCase().includes(searchLower) ||
          String(r.capacity).includes(searchLower) ||
          (r.department?.name ?? "").toLowerCase().includes(searchLower) ||
          (r.controlDepartment?.name ?? "").toLowerCase().includes(searchLower) ||
          (r.isLab ? "yes" : "no").includes(searchLower)
      )
    : list;

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-foreground">Rooms</h1>
        <Button type="button" onClick={openCreate}>Add Room</Button>
      </div>
      {list.length > 0 && (
        <div className="mb-4 relative max-w-md">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" aria-hidden>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </span>
          <input
            type="search"
            placeholder="Search by name, capacity, or department…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-border-strong py-2 pl-9 pr-3 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            aria-label="Search rooms"
          />
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No rooms yet. Add one to get started.</p>
          <Button type="button" onClick={openCreate}>Add Room</Button>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No rooms match &quot;{searchQuery.trim()}&quot;.</p>
          <button type="button" onClick={() => setSearchQuery("")} className="text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 rounded">
            Clear search
          </button>
        </div>
      ) : (
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Capacity</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Lab</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Department</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Control dept</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredList.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-foreground">{r.name}</td>
                  <td className="px-4 py-2 text-foreground-muted">{r.capacity}</td>
                  <td className="px-4 py-2 text-foreground-muted">{r.isLab ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-foreground-muted">{r.department?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground-muted">{r.controlDepartment?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button type="button" className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" aria-label="Actions">
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18" r="1.5" /></svg>
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content align="end">
                        <DropdownMenu.Item onSelect={() => openEdit(r)}>Edit</DropdownMenu.Item>
                        {canDeleteRoom && (
                          <DropdownMenu.Item onSelect={() => handleDeleteClick(r.id)} className="text-danger focus:bg-danger-muted focus:text-danger-hover">Move to trash</DropdownMenu.Item>
                        )}
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
        <Dialog.Content title={editingId ? "Edit Room" : "Add Room"}>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            <input type="number" min={1} placeholder="Capacity" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Department</label>
              <Select.Root value={form.departmentId || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v === "__none__" ? "" : v }))}>
                <Select.Trigger aria-label="Department">
                  <Select.Value placeholder="Select department" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="__none__">Select department</Select.Item>
                  {departments.map((d) => (
                    <Select.Item key={d.id} value={d.id}>{d.name}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Control department</label>
              <Select.Root value={form.controlDepartmentId || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, controlDepartmentId: v === "__none__" ? "" : v }))}>
                <Select.Trigger aria-label="Control department">
                  <Select.Value placeholder="None (open for all)" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="__none__">None (open for all)</Select.Item>
                  {departments.map((d) => (
                    <Select.Item key={d.id} value={d.id}>{d.name}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
              <p className="mt-0.5 text-xs text-foreground-muted">When set, room is closed by default each term; only this department can assign until they open it.</p>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isLab} onChange={(e) => setForm((f) => ({ ...f, isLab: e.target.checked }))} className="rounded border-border-strong focus:ring-focus-ring" />
              <span>Lab</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.hasComputer} onChange={(e) => setForm((f) => ({ ...f, hasComputer: e.target.checked }))} className="rounded border-border-strong focus:ring-focus-ring" />
              <span>Has computer</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.hasAC} onChange={(e) => setForm((f) => ({ ...f, hasAC: e.target.checked }))} className="rounded border-border-strong focus:ring-focus-ring" />
              <span>Has AC</span>
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
        <Dialog.Content title="Move room to trash" description="This room will be moved to Trash. You can restore it from the Trash page, or an admin can permanently delete it there.">
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
