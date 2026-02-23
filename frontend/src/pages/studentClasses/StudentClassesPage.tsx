import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { StudentClass } from "../../types/api";
import toast from "react-hot-toast";

export function StudentClassesPage() {
  const [list, setList] = useState<StudentClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", yearLevel: 1, curriculumId: "", studentCount: 0 });
  const [curricula, setCurricula] = useState<{ id: string; name: string }[]>([]);

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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this student class?")) return;
    try {
      await apiClient.delete(`/student-classes/${id}`);
      toast.success("Student class deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold text-slate-800">Student Classes</h1>
        <button type="button" onClick={openCreate} className="rounded bg-slate-800 text-white px-4 py-2 text-sm font-medium">
          Add Student Class
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
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Year Level</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Student Count</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Curriculum</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-slate-900">{c.name}</td>
                  <td className="px-4 py-2 text-slate-600">{c.yearLevel}</td>
                  <td className="px-4 py-2 text-slate-600">{c.studentCount}</td>
                  <td className="px-4 py-2 text-slate-600">{c.curriculum?.name ?? "—"}</td>
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
            <h2 className="text-lg font-semibold mb-4">{editingId ? "Edit Student Class" : "Add Student Class"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input required placeholder="Name (e.g. BSCE-3A)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border px-3 py-2" />
              <input required type="number" min={1} placeholder="Year level" value={form.yearLevel} onChange={(e) => setForm((f) => ({ ...f, yearLevel: Number(e.target.value) }))} className="w-full rounded border px-3 py-2" />
              <input required type="number" min={0} placeholder="Student count" value={form.studentCount} onChange={(e) => setForm((f) => ({ ...f, studentCount: Number(e.target.value) }))} className="w-full rounded border px-3 py-2" />
              <select value={form.curriculumId} onChange={(e) => setForm((f) => ({ ...f, curriculumId: e.target.value }))} className="w-full rounded border px-3 py-2">
                <option value="">Select curriculum</option>
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
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
