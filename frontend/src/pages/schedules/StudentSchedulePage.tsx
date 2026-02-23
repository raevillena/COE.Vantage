import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { FacultyLoad, AcademicYear, StudentClass } from "../../types/api";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";

export function StudentSchedulePage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [loads, setLoads] = useState<FacultyLoad[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.get("/academic-years").then(({ data }) => {
      setAcademicYears(data);
      const active = data.find((y: AcademicYear) => y.isActive);
      if (active) setAcademicYearId(active.id);
    });
    apiClient.get("/student-classes").then(({ data }) => setClasses(data));
  }, []);

  useEffect(() => {
    if (!academicYearId || !selectedClassId) {
      setLoads([]);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ academicYearId, semester: String(semester), studentClassId: selectedClassId });
    apiClient.get<FacultyLoad[]>(`/faculty-loads?${params}`).then(({ data }) => setLoads(data)).finally(() => setLoading(false));
  }, [academicYearId, semester, selectedClassId]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Student Class Schedule</h1>
      <div className="flex flex-wrap gap-4 mb-4">
        <select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="rounded border px-3 py-2">
          <option value="">Academic Year</option>
          {academicYears.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select value={semester} onChange={(e) => setSemester(Number(e.target.value))} className="rounded border px-3 py-2">
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
        <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} className="rounded border px-3 py-2 min-w-[200px]">
          <option value="">Select class</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {loading ? <p className="text-slate-500">Loading…</p> : selectedClassId ? <ScheduleGrid loads={loads} /> : <p className="text-slate-500">Select a class.</p>}
    </div>
  );
}
