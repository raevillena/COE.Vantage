import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { UserListItem } from "../../types/api";
import type { Role } from "../../types/auth";
import toast from "react-hot-toast";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";

export function UsersPage() {
  const [list, setList] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "FACULTY" as Role, departmentId: "" });
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [resetEmailLoading, setResetEmailLoading] = useState<string | null>(null);

  const handleSendResetEmail = async (email: string) => {
    setResetEmailLoading(email);
    try {
      await apiClient.post("/auth/send-password-reset-email", { email });
      toast.success("Password reset email sent to " + email);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to send";
      toast.error(msg);
    } finally {
      setResetEmailLoading(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<UserListItem[]>("/users");
      setList(data);
    } catch {
      toast.error("Failed to load users");
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
    setForm({ email: "", password: "", name: "", role: "FACULTY", departmentId: "" });
    setModalOpen(true);
  };

  const openEdit = (u: UserListItem) => {
    setEditingId(u.id);
    setForm({ email: u.email, password: "", name: u.name, role: u.role, departmentId: u.departmentId ?? "" });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = form.name.trim();
    const emailTrimmed = form.email.trim();
    if (!nameTrimmed) {
      toast.error("Name is required");
      return;
    }
    if (!emailTrimmed) {
      toast.error("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      toast.error("Enter a valid email address");
      return;
    }
    if (!editingId && !form.password.trim()) {
      toast.error("Password is required when creating a user");
      return;
    }
    try {
      if (editingId) {
        await apiClient.patch(`/users/${editingId}`, {
          email: emailTrimmed,
          name: nameTrimmed,
          role: form.role,
          departmentId: form.departmentId || null,
        });
        toast.success("User updated");
      } else {
        await apiClient.post("/users", { ...form, name: nameTrimmed, email: emailTrimmed, departmentId: form.departmentId || null });
        toast.success("User created");
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
      await apiClient.delete(`/users/${deleteConfirmId}`);
      toast.success("User moved to trash");
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
        <h1 className="text-2xl font-semibold text-foreground">Users</h1>
        <Button type="button" onClick={openCreate}>Add User</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No users yet. Add one to get started.</p>
          <Button type="button" onClick={openCreate}>Add User</Button>
        </div>
      ) : (
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Email</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Role</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Department</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-foreground">{u.name}</td>
                  <td className="px-4 py-2 text-foreground-muted">{u.email}</td>
                  <td className="px-4 py-2 text-foreground-muted">{u.role}</td>
                  <td className="px-4 py-2 text-foreground-muted">{u.department?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button type="button" className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" aria-label="Actions">
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18" r="1.5" /></svg>
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content align="end">
                        <DropdownMenu.Item onSelect={() => openEdit(u)}>Edit</DropdownMenu.Item>
                        <DropdownMenu.Item
                          onSelect={() => handleSendResetEmail(u.email)}
                          disabled={resetEmailLoading === u.email}
                        >
                          {resetEmailLoading === u.email ? "Sending…" : "Send password reset email"}
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => handleDeleteClick(u.id)} className="text-danger focus:bg-danger-muted focus:text-danger-hover">Move to trash</DropdownMenu.Item>
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
        <Dialog.Content title={editingId ? "Edit User" : "Add User"}>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            {!editingId && <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />}
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Role</label>
              <Select.Root value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}>
                <Select.Trigger aria-label="Role">
                  <Select.Value placeholder="Role" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="ADMIN">ADMIN</Select.Item>
                  <Select.Item value="DEAN">DEAN</Select.Item>
                  <Select.Item value="CHAIRMAN">CHAIRMAN</Select.Item>
                  <Select.Item value="FACULTY">FACULTY</Select.Item>
                  <Select.Item value="OFFICER">OFFICER</Select.Item>
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

      <Dialog.Root open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <Dialog.Content title="Move user to trash" description="This user will be moved to Trash. They will not be able to sign in until restored. You can restore or permanently delete from the Trash page.">
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
