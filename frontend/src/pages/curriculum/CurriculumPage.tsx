import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { Curriculum } from "../../types/api";
import toast from "react-hot-toast";

export function CurriculumPage() {
  const [list, setList] = useState<Curriculum[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", departmentId: "" });
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<Curriculum[]>("/curriculum");
      setList(data);
    } catch {
      toast.error("Failed to load curriculum");
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
    setForm({ name: "", code: "", departmentId: "" });
    setModalOpen(true);
  };

  const openEdit = (c: Curriculum) => {
    setEditingId(c.id);
    setForm({ name: c.name, code: c.code ?? "", departmentId: c.departmentId ?? "" });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { name: form.name, code: form.code || undefined, departmentId: form.departmentId || null };
      if (editingId) {
        await apiClient.patch(`/curriculum/${editingId}`, payload);
        toast.success("Curriculum updated");
      } else {
        await apiClient.post("/curriculum", payload);
        toast.success("Curriculum created");
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this curriculum?")) return;
    try {
      await apiClient.delete(`/curriculum/${id}`);
      toast.success("Curriculum deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold text-slate-800">Curriculum</h1>
        <button type="button" onClick={openCreate} className="rounded bg-slate-800 text-white px-4 py-2 text-sm font-medium">
          Add Curriculum
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
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Code</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Department</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-slate-900">{c.name}</td>
                  <td className="px-4 py-2 text-slate-600">{c.code ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{c.department?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" onClick={() => openEdit(c)} className="text-slate-600 hover:text-slate-900 mr-2">Edit</button>
                    <button type="button" onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-800">Delete</button>
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
            <h2 className="text-lg font-semibold mb-4">{editingId ? "Edit Curriculum" : "Add Curriculum"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border px-3 py-2" />
              <input placeholder="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="w-full rounded border px-3 py-2" />
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
