import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { Subject } from "../../types/api";
import toast from "react-hot-toast";

export function SubjectsPage() {
  const [list, setList] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", name: "", units: 3, isLab: false, curriculumId: "", departmentId: "" });
  const [curricula, setCurricula] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

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
    setForm({ code: "", name: "", units: 3, isLab: false, curriculumId: "", departmentId: "" });
    setModalOpen(true);
  };

  const openEdit = (s: Subject) => {
    setEditingId(s.id);
    setForm({ code: s.code, name: s.name, units: s.units, isLab: s.isLab, curriculumId: s.curriculumId ?? "", departmentId: s.departmentId ?? "" });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { code: form.code, name: form.name, units: form.units, isLab: form.isLab, curriculumId: form.curriculumId || null, departmentId: form.departmentId || null };
      if (editingId) {
        await apiClient.patch(`/subjects/${editingId}`, payload);
        toast.success("Subject updated");
      } else {
        await apiClient.post("/subjects", payload);
        toast.success("Subject created");
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this subject?")) return;
    try {
      await apiClient.delete(`/subjects/${id}`);
      toast.success("Subject deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold text-slate-800">Subjects</h1>
        <button type="button" onClick={openCreate} className="rounded bg-slate-800 text-white px-4 py-2 text-sm font-medium">
          Add Subject
        </button>
      </div>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="rounded border border-slate-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Code</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Name</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Units</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Lab</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {list.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 text-slate-900">{s.code}</td>
                  <td className="px-4 py-2 text-slate-600">{s.name}</td>
                  <td className="px-4 py-2 text-slate-600">{s.units}</td>
                  <td className="px-4 py-2 text-slate-600">{s.isLab ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" onClick={() => openEdit(s)} className="text-slate-600 hover:text-slate-900 mr-2">Edit</button>
                    <button type="button" onClick={() => handleDelete(s.id)} className="text-red-600 hover:text-red-800">Delete</button>
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
            <h2 className="text-lg font-semibold mb-4">{editingId ? "Edit Subject" : "Add Subject"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input required placeholder="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="w-full rounded border px-3 py-2" />
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border px-3 py-2" />
              <input required type="number" min={0} placeholder="Units" value={form.units} onChange={(e) => setForm((f) => ({ ...f, units: Number(e.target.value) }))} className="w-full rounded border px-3 py-2" />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isLab} onChange={(e) => setForm((f) => ({ ...f, isLab: e.target.checked }))} />
                <span>Lab subject</span>
              </label>
              <select value={form.curriculumId} onChange={(e) => setForm((f) => ({ ...f, curriculumId: e.target.value }))} className="w-full rounded border px-3 py-2">
                <option value="">No curriculum</option>
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
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
