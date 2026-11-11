import { useEffect, useState } from "react";
import { PageReloadButton } from "../../components/ui/pageReloadButton";
import { schedulingTerm, yearLabel } from "../../utils/currentTerm";
import { useReloadTick } from "../../context/PageReloadContext";
import { apiClient } from "../../api/apiClient";
import type { FacultyLoad, AcademicYear, Room } from "../../types/api";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";
import { SearchableSelect } from "../../components/ui/searchableSelect";
import { Select } from "../../components/ui/select";
import { Spinner } from "../../components/ui/spinner";
import { useAppSelector } from "../../store/hooks";
import { useScheduleReleased } from "../../hooks/useScheduleReleased";
import { ScheduleHeldNotice } from "../../components/ui/scheduleHeldNotice";

export function RoomAvailabilityPage() {
  // A faculty member only sees the rooms they teach in, and only through the report endpoints.
  const isFaculty = useAppSelector((s) => s.auth.user?.role) === "FACULTY";
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [loads, setLoads] = useState<FacultyLoad[]>([]);
  const [loading, setLoading] = useState(false);
  const reloadTick = useReloadTick();
  const released = useScheduleReleased(isFaculty, academicYearId, semester);
  const held = isFaculty && released !== true; // nothing until the college locks the term

  useEffect(() => {
    apiClient.get<AcademicYear[]>("/academic-years/for-schedules").then(({ data }) => {
      setAcademicYears(data);
      if (data.length >= 1) {
        const term = schedulingTerm(data);
        if (term) {
          setAcademicYearId(term.academicYearId);
          setSemester(term.semester);
        }
      }
    });
    if (!isFaculty) apiClient.get("/rooms").then(({ data }) => setRooms(data));
  }, [isFaculty]);

  useEffect(() => {
    if (!isFaculty) return;
    if (!academicYearId || held) {
      setRooms([]);
      return;
    }
    const mine = new URLSearchParams({ academicYearId, semester: String(semester) });
    apiClient
      .get<Room[]>(`/reports/my/rooms?${mine}`)
      .then(({ data }) => {
        setRooms(data ?? []);
        setSelectedRoomId((cur) => ((data ?? []).some((r) => r.id === cur) ? cur : ""));
      })
      .catch(() => setRooms([]));
  }, [isFaculty, held, academicYearId, semester]);

  useEffect(() => {
    if (!academicYearId || !selectedRoomId || held) {
      setLoads([]);
      return;
    }
    setLoading(true);
    if (isFaculty) {
      const q = new URLSearchParams({ academicYearId, semester: String(semester) });
      apiClient
        .get<{ loads: FacultyLoad[] }>(`/reports/room/${selectedRoomId}/data?${q}`)
        .then(({ data }) => setLoads(data.loads ?? []))
        .catch(() => setLoads([]))
        .finally(() => setLoading(false));
      return;
    }
    const params = new URLSearchParams({ academicYearId, semester: String(semester), roomId: selectedRoomId });
    apiClient.get<FacultyLoad[]>(`/faculty-loads?${params}`).then(({ data }) => setLoads(data)).finally(() => setLoading(false));
  }, [academicYearId, semester, selectedRoomId, isFaculty, held, reloadTick]);

  const room = rooms.find((r) => r.id === selectedRoomId);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2"><h1 className="text-2xl font-semibold text-foreground">Room Availability</h1><PageReloadButton /></div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Academic Year</label>
          <SearchableSelect
            options={academicYears.map((y) => ({ value: y.id, label: yearLabel(y, "scheduling") }))}
            value={academicYearId || "__none__"}
            onValueChange={(v) => setAcademicYearId(v === "__none__" ? "" : v)}
            noneOption={{ value: "__none__", label: "Academic Year" }}
            placeholder="Search academic year…"
            aria-label="Academic year"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Scheduling Semester</label>
          <Select.Root value={String(semester)} onValueChange={(v) => setSemester(Number(v))}>
            <Select.Trigger aria-label="Scheduling Semester" className="w-[100px]">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="1">1</Select.Item>
              <Select.Item value="2">2</Select.Item>
              <Select.Item value="3">Mid Year</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
        <div className="min-w-[200px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Room</label>
          <SearchableSelect
            options={rooms.map((r) => ({ value: r.id, label: `${r.name} (cap: ${r.capacity}${r.isLab ? ", Lab" : ""})${r.department?.code ? ` · ${r.department.code}` : ""}` }))}
            value={selectedRoomId || "__none__"}
            onValueChange={(v) => setSelectedRoomId(v === "__none__" ? "" : v)}
            noneOption={{ value: "__none__", label: "Select room" }}
            placeholder="Search room…"
            aria-label="Room"
          />
        </div>
      </div>
      {room && <p className="text-foreground-muted mb-2">{room.name} — Capacity: {room.capacity} {room.isLab ? "— Lab" : ""}</p>}
      {held ? (
        <ScheduleHeldNotice />
      ) : loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : !selectedRoomId ? (
        <p className="text-foreground-muted">
          {isFaculty && rooms.length === 0 ? "You have no rooms in this term." : "Select a room."}
        </p>
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
