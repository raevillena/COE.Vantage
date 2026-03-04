import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { FacultyLoad, AcademicYear, Room } from "../../types/api";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";
import { Select } from "../../components/ui/select";
import { Spinner } from "../../components/ui/spinner";

export function RoomAvailabilityPage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [loads, setLoads] = useState<FacultyLoad[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.get<AcademicYear[]>("/academic-years/for-schedules").then(({ data }) => {
      setAcademicYears(data);
      if (data.length >= 1) {
        const active = data.find((y) => y.isActive);
        setAcademicYearId(active?.id ?? data[0].id);
      }
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
      <h1 className="text-2xl font-semibold text-foreground mb-4">Room Availability</h1>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Academic Year</label>
          <Select.Root value={academicYearId || "__none__"} onValueChange={(v) => setAcademicYearId(v === "__none__" ? "" : v)}>
            <Select.Trigger aria-label="Academic year" className="w-full">
              <Select.Value placeholder="Academic Year" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="__none__">Academic Year</Select.Item>
              {academicYears.map((y) => <Select.Item key={y.id} value={y.id}>{y.isActive ? `${y.name} (current)` : y.name}</Select.Item>)}
            </Select.Content>
          </Select.Root>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Semester</label>
          <Select.Root value={String(semester)} onValueChange={(v) => setSemester(Number(v))}>
            <Select.Trigger aria-label="Semester" className="w-[100px]">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="1">1</Select.Item>
              <Select.Item value="2">2</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
        <div className="min-w-[200px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Room</label>
          <Select.Root value={selectedRoomId || "__none__"} onValueChange={(v) => setSelectedRoomId(v === "__none__" ? "" : v)}>
            <Select.Trigger aria-label="Room">
              <Select.Value placeholder="Select room" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="__none__">Select room</Select.Item>
              {rooms.map((r) => <Select.Item key={r.id} value={r.id}>{r.name} (cap: {r.capacity}{r.isLab ? ", Lab" : ""})</Select.Item>)}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
      {room && <p className="text-foreground-muted mb-2">{room.name} — Capacity: {room.capacity} {room.isLab ? "— Lab" : ""}</p>}
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : !selectedRoomId ? (
        <p className="text-foreground-muted">Select a room.</p>
      ) : loads.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted">No schedule entries for this room. Change filters to see other data.</p>
        </div>
      ) : (
        <ScheduleGrid loads={loads} />
      )}
    </div>
  );
}
