import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { FacultyLoad, AcademicYear, UserListItem } from "../../types/api";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";
import { AddFacultyLoadModal } from "../../components/addFacultyLoadModal/AddFacultyLoadModal";
import toast from "react-hot-toast";

export function SchedulerPage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [faculties, setFaculties] = useState<UserListItem[]>([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
  const [loads, setLoads] = useState<FacultyLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    apiClient.get("/academic-years").then(({ data }) => {
      setAcademicYears(data);
      const active = data.find((y: AcademicYear) => y.isActive);
      if (active) setAcademicYearId(active.id);
    });
    apiClient.get("/users?role=FACULTY").then(({ data }) => setFaculties(data));
  }, []);

  useEffect(() => {
    if (!academicYearId) {
      setLoads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ academicYearId, semester: String(semester) });
    if (selectedFacultyId) params.set("facultyId", selectedFacultyId);
    apiClient.get<FacultyLoad[]>(`/faculty-loads?${params}`).then(({ data }) => setLoads(data)).catch(() => toast.error("Failed to load")).finally(() => setLoading(false));
  }, [academicYearId, semester, selectedFacultyId]);

  const refreshLoads = () => {
    if (!academicYearId) return;
    const params = new URLSearchParams({ academicYearId, semester: String(semester) });
    if (selectedFacultyId) params.set("facultyId", selectedFacultyId);
    apiClient.get<FacultyLoad[]>(`/faculty-loads?${params}`).then(({ data }) => setLoads(data));
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Scheduler</h1>
      <div className="flex flex-wrap gap-4 mb-4">
        <select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="rounded border px-3 py-2">
          <option value="">Academic Year</option>
          {academicYears.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select value={semester} onChange={(e) => setSemester(Number(e.target.value))} className="rounded border px-3 py-2">
          <option value={1}>Sem 1</option>
          <option value={2}>Sem 2</option>
        </select>
        <select value={selectedFacultyId} onChange={(e) => setSelectedFacultyId(e.target.value)} className="rounded border px-3 py-2 min-w-[200px]">
          <option value="">All faculty</option>
          {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {academicYearId && (
          <button type="button" onClick={() => setAddModalOpen(true)} className="rounded bg-slate-800 text-white px-4 py-2 text-sm font-medium">
            Add load
          </button>
        )}
      </div>
      {loading ? <p className="text-slate-500">Loading…</p> : <ScheduleGrid loads={loads} />}
      {addModalOpen && academicYearId && (
        <AddFacultyLoadModal academicYearId={academicYearId} semester={semester} onClose={() => setAddModalOpen(false)} onSaved={refreshLoads} />
      )}
    </div>
  );
}
