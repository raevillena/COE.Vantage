import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { AcademicYear } from "../../types/api";
import toast from "react-hot-toast";

export function AcademicYearsPage() {
  const [list, setList] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", isActive: false });

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
    try {
      if (editingId) {
        await apiClient.patch(`/academic-years/${editingId}`, form);
        toast.success("Academic year updated");
      } else {
        await apiClient.post("/academic-years", form);
        toast.success("Academic year created");
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this academic year?")) return;
    try {
      await apiClient.delete(`/academic-years/${id}`);
      toast.success("Academic year deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold text-slate-800">Academic Years</h1>
        <button type="button" onClick={openCreate} className="rounded bg-slate-800 text-white px-4 py-2 text-sm font-medium">
          Add Academic Year
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
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Active</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {list.map((y) => (
                <tr key={y.id}>
                  <td className="px-4 py-2 text-slate-900">{y.name}</td>
                  <td className="px-4 py-2 text-slate-600">{y.isActive ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" onClick={() => openEdit(y)} className="text-slate-600 hover:text-slate-900 mr-2">Edit</button>
                    <button type="button" onClick={() => handleDelete(y.id)} className="text-red-600 hover:text-red-800">Delete</button>
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
            <h2 className="text-lg font-semibold mb-4">{editingId ? "Edit Academic Year" : "Add Academic Year"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input required placeholder="Name (e.g. 2025-2026)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border px-3 py-2" />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                <span>Set as active (only one can be active)</span>
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
