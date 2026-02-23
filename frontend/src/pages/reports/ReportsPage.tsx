import { useState, useEffect } from "react";
import { apiClient } from "../../api/apiClient";
import type { AcademicYear } from "../../types/api";
import type { UserListItem } from "../../types/api";
import type { StudentClass } from "../../types/api";
import type { Room } from "../../types/api";
import toast from "react-hot-toast";

export function ReportsPage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [faculties, setFaculties] = useState<UserListItem[]>([]);
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [facultyId, setFacultyId] = useState("");
  const [classId, setClassId] = useState("");
  const [roomId, setRoomId] = useState("");

  useEffect(() => {
    apiClient.get("/academic-years").then(({ data }) => {
      setAcademicYears(data);
      const active = data.find((y: AcademicYear) => y.isActive);
      if (active) setAcademicYearId(active.id);
    });
    apiClient.get("/users?role=FACULTY").then(({ data }) => setFaculties(data));
    apiClient.get("/student-classes").then(({ data }) => setClasses(data));
    apiClient.get("/rooms").then(({ data }) => setRooms(data));
  }, []);

  const downloadReport = async (url: string, filename: string) => {
    if (!academicYearId) {
      toast.error("Select academic year");
      return;
    }
    const params = new URLSearchParams({ academicYearId, semester: String(semester) });
    try {
      const { data } = await apiClient.get<Blob>(`${url}?${params}`, { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(data);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Download started");
    } catch {
      toast.error("Download failed");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Reports</h1>
      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-slate-600 text-sm">Academic Year</span>
          <select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="rounded border border-slate-300 px-3 py-2">
            <option value="">Select</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-600 text-sm">Semester</span>
          <select value={semester} onChange={(e) => setSemester(Number(e.target.value))} className="rounded border border-slate-300 px-3 py-2">
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
      </div>
      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-medium text-slate-800 mb-2">Faculty Report</h2>
          <p className="text-sm text-slate-600 mb-3">PDF with weekly grid and total units.</p>
          <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 mb-2">
            <option value="">Select faculty</option>
            {faculties.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!facultyId || !academicYearId}
            onClick={() => downloadReport(`/reports/faculty/${facultyId}`, `faculty-${facultyId}.pdf`)}
            className="rounded bg-slate-800 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Download PDF
          </button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-medium text-slate-800 mb-2">Student Class Report</h2>
          <p className="text-sm text-slate-600 mb-3">PDF with class schedule and total units.</p>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 mb-2">
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!classId || !academicYearId}
            onClick={() => downloadReport(`/reports/student-class/${classId}`, `class-${classId}.pdf`)}
            className="rounded bg-slate-800 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Download PDF
          </button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-medium text-slate-800 mb-2">Room Report</h2>
          <p className="text-sm text-slate-600 mb-3">PDF with room occupancy grid.</p>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 mb-2">
            <option value="">Select room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!roomId || !academicYearId}
            onClick={() => downloadReport(`/reports/room/${roomId}`, `room-${roomId}.pdf`)}
            className="rounded bg-slate-800 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Download PDF
          </button>
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500">Reports require authentication. Download opens in a new request with your cookies.</p>
    </div>
  );
}
