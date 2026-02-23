import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { FacultyLoad, AcademicYear, Room } from "../../types/api";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";

export function RoomAvailabilityPage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [loads, setLoads] = useState<FacultyLoad[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.get("/academic-years").then(({ data }) => {
      setAcademicYears(data);
      const active = data.find((y: AcademicYear) => y.isActive);
      if (active) setAcademicYearId(active.id);
    });
    apiClient.get("/rooms").then(({ data }) => setRooms(data));
  }, []);

  useEffect(() => {
    if (!academicYearId || !selectedRoomId) {
      setLoads([]);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ academicYearId, semester: String(semester), roomId: selectedRoomId });
    apiClient.get<FacultyLoad[]>(`/faculty-loads?${params}`).then(({ data }) => setLoads(data)).finally(() => setLoading(false));
  }, [academicYearId, semester, selectedRoomId]);

  const room = rooms.find((r) => r.id === selectedRoomId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Room Availability</h1>
      <div className="flex flex-wrap gap-4 mb-4">
        <select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="rounded border px-3 py-2">
          <option value="">Academic Year</option>
          {academicYears.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select value={semester} onChange={(e) => setSemester(Number(e.target.value))} className="rounded border px-3 py-2">
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
        <select value={selectedRoomId} onChange={(e) => setSelectedRoomId(e.target.value)} className="rounded border px-3 py-2 min-w-[200px]">
          <option value="">Select room</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} (cap: {r.capacity}{r.isLab ? ", Lab" : ""})</option>)}
        </select>
      </div>
      {room && <p className="text-slate-600 mb-2">{room.name} — Capacity: {room.capacity} {room.isLab ? "— Lab" : ""}</p>}
      {loading ? <p className="text-slate-500">Loading…</p> : selectedRoomId ? <ScheduleGrid loads={loads} /> : <p className="text-slate-500">Select a room.</p>}
    </div>
  );
}
