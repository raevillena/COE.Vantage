import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { UserListItem } from "../../types/api";
import type { Role } from "../../types/auth";
import toast from "react-hot-toast";

export function UsersPage() {
  const [list, setList] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "FACULTY" as Role, departmentId: "" });
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

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
    try {
      if (editingId) {
        await apiClient.patch(`/users/${editingId}`, {
          email: form.email,
          name: form.name,
          role: form.role,
          departmentId: form.departmentId || null,
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success("User updated");
      } else {
        await apiClient.post("/users", { ...form, departmentId: form.departmentId || null });
        toast.success("User created");
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this user?")) return;
    try {
      await apiClient.delete(`/users/${id}`);
      toast.success("User deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold text-slate-800">Users</h1>
        <button type="button" onClick={openCreate} className="rounded bg-slate-800 text-white px-4 py-2 text-sm font-medium">
          Add User
        </button>
      </div>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="rounded border border-slate-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Name</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Email</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Role</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Department</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {list.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-slate-900">{u.name}</td>
                  <td className="px-4 py-2 text-slate-600">{u.email}</td>
                  <td className="px-4 py-2 text-slate-600">{u.role}</td>
                  <td className="px-4 py-2 text-slate-600">{u.department?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" onClick={() => openEdit(u)} className="text-slate-600 hover:text-slate-900 mr-2">Edit</button>
                    <button type="button" onClick={() => handleDelete(u.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">{editingId ? "Edit User" : "Add User"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border px-3 py-2" />
              <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded border px-3 py-2" />
              {!editingId && <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="w-full rounded border px-3 py-2" />}
              {editingId && <input type="password" placeholder="New password (leave blank to keep)" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="w-full rounded border px-3 py-2" />}
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))} className="w-full rounded border px-3 py-2">
                <option value="ADMIN">ADMIN</option>
                <option value="DEAN">DEAN</option>
                <option value="CHAIRMAN">CHAIRMAN</option>
                <option value="FACULTY">FACULTY</option>
                <option value="OFFICER">OFFICER</option>
              </select>
              <select value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))} className="w-full rounded border px-3 py-2">
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded border border-slate-300 px-4 py-2">Cancel</button>
                <button type="submit" className="rounded bg-slate-800 text-white px-4 py-2">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
