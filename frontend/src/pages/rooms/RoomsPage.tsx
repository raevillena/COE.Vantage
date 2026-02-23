import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { Room } from "../../types/api";
import toast from "react-hot-toast";

export function RoomsPage() {
  const [list, setList] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", capacity: 20, hasComputer: false, isLab: false, hasAC: false, departmentId: "" });
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

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
    setForm({ name: "", capacity: 20, hasComputer: false, isLab: false, hasAC: false, departmentId: departments[0]?.id ?? "" });
    setModalOpen(true);
  };

  const openEdit = (r: Room) => {
    setEditingId(r.id);
    setForm({ name: r.name, capacity: r.capacity, hasComputer: r.hasComputer, isLab: r.isLab, hasAC: r.hasAC, departmentId: r.departmentId });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.departmentId) {
      toast.error("Select a department");
      return;
    }
    try {
      if (editingId) {
        await apiClient.patch(`/rooms/${editingId}`, form);
        toast.success("Room updated");
      } else {
        await apiClient.post("/rooms", form);
        toast.success("Room created");
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this room?")) return;
    try {
      await apiClient.delete(`/rooms/${id}`);
      toast.success("Room deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold text-slate-800">Rooms</h1>
        <button type="button" onClick={openCreate} className="rounded bg-slate-800 text-white px-4 py-2 text-sm font-medium">
          Add Room
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
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Capacity</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Lab</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Department</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-slate-900">{r.name}</td>
                  <td className="px-4 py-2 text-slate-600">{r.capacity}</td>
                  <td className="px-4 py-2 text-slate-600">{r.isLab ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-slate-600">{r.department?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" onClick={() => openEdit(r)} className="text-slate-600 hover:text-slate-900 mr-2">Edit</button>
                    <button type="button" onClick={() => handleDelete(r.id)} className="text-red-600 hover:text-red-800">Delete</button>
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
            <h2 className="text-lg font-semibold mb-4">{editingId ? "Edit Room" : "Add Room"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border px-3 py-2" />
              <input required type="number" min={1} placeholder="Capacity" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))} className="w-full rounded border px-3 py-2" />
              <select value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))} className="w-full rounded border px-3 py-2">
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isLab} onChange={(e) => setForm((f) => ({ ...f, isLab: e.target.checked }))} />
                <span>Lab</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.hasComputer} onChange={(e) => setForm((f) => ({ ...f, hasComputer: e.target.checked }))} />
                <span>Has computer</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.hasAC} onChange={(e) => setForm((f) => ({ ...f, hasAC: e.target.checked }))} />
                <span>Has AC</span>
              </label>
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
