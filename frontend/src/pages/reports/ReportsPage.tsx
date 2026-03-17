import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../../api/apiClient";
import type { AcademicYear } from "../../types/api";
import type { UserListItem } from "../../types/api";
import type { StudentClass } from "../../types/api";
import type { Room } from "../../types/api";
import type { FacultyLoad } from "../../types/api";
import toast from "react-hot-toast";
import { Select } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { SearchableSelect } from "../../components/ui/searchableSelect";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";
import { Spinner } from "../../components/ui/spinner";
import { useSchedulePalette, type SchedulePaletteId } from "../../context/SchedulePaletteContext";

const HOUR_END = 21;

function SchedulePaletteSelect() {
  const { paletteId, palettes, setPaletteId } = useSchedulePalette();
  return (
    <Select.Root value={paletteId} onValueChange={(v) => setPaletteId(v as SchedulePaletteId)}>
      <Select.Trigger aria-label="Block color palette" className="w-[120px]">
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        {palettes.map((p) => (
          <Select.Item key={p.id} value={p.id}>
            {p.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}

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

  const [facultyLoads, setFacultyLoads] = useState<FacultyLoad[] | null>(null);
  const [facultyLoadsLoading, setFacultyLoadsLoading] = useState(false);
  const [classLoads, setClassLoads] = useState<FacultyLoad[] | null>(null);
  const [classLoadsLoading, setClassLoadsLoading] = useState(false);
  const [roomLoads, setRoomLoads] = useState<FacultyLoad[] | null>(null);
  const [roomLoadsLoading, setRoomLoadsLoading] = useState(false);

  useEffect(() => {
    apiClient.get<AcademicYear[]>("/academic-years/for-schedules").then(({ data }) => {
      setAcademicYears(data);
      if (data.length >= 1) {
        const active = data.find((y) => y.isActive);
        setAcademicYearId(active?.id ?? data[0].id);
      }
    });
    apiClient.get<UserListItem[]>("/users", { params: { role: "FACULTY" } }).then(({ data }) => setFaculties(data ?? []));
    apiClient.get<StudentClass[]>("/student-classes").then(({ data }) => setClasses(data ?? []));
    apiClient.get<Room[]>("/rooms").then(({ data }) => setRooms(data ?? []));
  }, []);

  const fetchFacultyData = useCallback(async () => {
    if (!academicYearId || !facultyId) {
      setFacultyLoads(null);
      return;
    }
    setFacultyLoadsLoading(true);
    try {
      const params = new URLSearchParams({ academicYearId, semester: String(semester) });
      const { data } = await apiClient.get<{ faculty: { name: string }; loads: FacultyLoad[] }>(
        `/reports/faculty/${facultyId}/data?${params}`
      );
      setFacultyLoads(data.loads ?? []);
    } catch (e) {
      toast.error("Failed to load faculty schedule");
      setFacultyLoads(null);
    } finally {
      setFacultyLoadsLoading(false);
    }
  }, [academicYearId, semester, facultyId]);

  const fetchClassData = useCallback(async () => {
    if (!academicYearId || !classId) {
      setClassLoads(null);
      return;
    }
    setClassLoadsLoading(true);
    try {
      const params = new URLSearchParams({ academicYearId, semester: String(semester) });
      const { data } = await apiClient.get<{ studentClass: { name: string }; loads: FacultyLoad[] }>(
        `/reports/student-class/${classId}/data?${params}`
      );
      setClassLoads(data.loads ?? []);
    } catch (e) {
      toast.error("Failed to load class schedule");
      setClassLoads(null);
    } finally {
      setClassLoadsLoading(false);
    }
  }, [academicYearId, semester, classId]);

  const fetchRoomData = useCallback(async () => {
    if (!academicYearId || !roomId) {
      setRoomLoads(null);
      return;
    }
    setRoomLoadsLoading(true);
    try {
      const params = new URLSearchParams({ academicYearId, semester: String(semester) });
      const { data } = await apiClient.get<{ room: { name: string }; loads: FacultyLoad[] }>(
        `/reports/room/${roomId}/data?${params}`
      );
      setRoomLoads(data.loads ?? []);
    } catch (e) {
      toast.error("Failed to load room schedule");
      setRoomLoads(null);
    } finally {
      setRoomLoadsLoading(false);
    }
  }, [academicYearId, semester, roomId]);

  useEffect(() => {
    fetchFacultyData();
  }, [fetchFacultyData]);
  useEffect(() => {
    fetchClassData();
  }, [fetchClassData]);
  useEffect(() => {
    fetchRoomData();
  }, [fetchRoomData]);

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

  const totalUnits = (loads: FacultyLoad[]) =>
    loads.reduce((sum, l) => sum + (l.subject?.units ?? 0), 0);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-foreground">Reports</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        View schedule grids (same as in the Scheduler) and download PDF or Excel reports for the selected term.
      </p>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-[200px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Academic year</label>
          <SearchableSelect
            options={academicYears.map((y) => ({
              value: y.id,
              label: y.isActive ? `${y.name} (current)` : y.name,
            }))}
            value={academicYearId || "__none__"}
            onValueChange={(v) => setAcademicYearId(v === "__none__" ? "" : v)}
            placeholder="Search year…"
            noneOption={{ value: "__none__", label: "Select year" }}
            aria-label="Academic year"
          />
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
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-medium text-foreground-muted">Block colors</span>
          <SchedulePaletteSelect />
        </div>
      </div>

      <div className="space-y-8">
        {/* Faculty report */}
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 font-medium text-foreground">Faculty report</h2>
          <p className="mb-3 text-sm text-foreground-muted">
            Weekly schedule grid and total units. Same view as in the Scheduler.
          </p>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-48 max-w-xs">
              <label className="mb-1 block text-sm font-medium text-foreground">Faculty</label>
              <SearchableSelect
                options={faculties.map((f) => ({ value: f.id, label: f.name }))}
                value={facultyId || "__none__"}
                onValueChange={(v) => setFacultyId(v === "__none__" ? "" : v)}
                placeholder="Search faculty…"
                noneOption={{ value: "__none__", label: "Select faculty" }}
                aria-label="Faculty"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!facultyId || !academicYearId}
              onClick={() => downloadReport(`/reports/faculty/${facultyId}`, `faculty-${facultyId}.pdf`)}
            >
              Download PDF
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!facultyId || !academicYearId}
              onClick={() => downloadReport(`/reports/faculty/${facultyId}/nota`, `NOTA-${facultyId}.pdf`)}
            >
              Download NOTA
            </Button>
          </div>
          {facultyLoadsLoading ? (
            <div className="flex justify-center py-12 rounded border border-border bg-surface-muted/30" aria-busy="true">
              <Spinner />
            </div>
          ) : facultyLoads !== null && facultyLoads.length >= 0 ? (
            <>
              {facultyLoads.length > 0 && (
                <p className="mb-2 text-sm text-foreground-muted">
                  Total units: <strong className="text-foreground">{totalUnits(facultyLoads)}</strong> · {facultyLoads.length} block(s)
                </p>
              )}
              <div className="min-h-[200px] overflow-x-auto rounded border border-border bg-surface">
                {facultyLoads && facultyLoads.length > 0 ? (
                  <ScheduleGrid
                    loads={facultyLoads}
                    readOnly
                    wrapInScroll={false}
                    hourEnd={HOUR_END}
                    draggableIdPrefix="report-faculty"
                    fitWidth
                  />
                ) : facultyId && academicYearId ? (
                  <div className="flex items-center justify-center py-12 text-foreground-muted">
                    No schedule for this faculty in the selected term.
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12 text-foreground-muted">
                    Select academic year and faculty to view schedule.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>

        {/* Student class report */}
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 font-medium text-foreground">Student class report</h2>
          <p className="mb-3 text-sm text-foreground-muted">
            Class schedule grid and total units. Same view as in the Scheduler.
          </p>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-48 max-w-xs">
              <label className="mb-1 block text-sm font-medium text-foreground">Student class</label>
              <SearchableSelect
                options={classes.map((c) => ({ value: c.id, label: c.name }))}
                value={classId || "__none__"}
                onValueChange={(v) => setClassId(v === "__none__" ? "" : v)}
                placeholder="Search class…"
                noneOption={{ value: "__none__", label: "Select class" }}
                aria-label="Student class"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!classId || !academicYearId}
              onClick={() => downloadReport(`/reports/student-class/${classId}`, `class-${classId}.pdf`)}
            >
              Download PDF
            </Button>
          </div>
          {classLoadsLoading ? (
            <div className="flex justify-center py-12 rounded border border-border bg-surface-muted/30" aria-busy="true">
              <Spinner />
            </div>
          ) : classLoads !== null && classLoads.length >= 0 ? (
            <>
              {classLoads.length > 0 && (
                <p className="mb-2 text-sm text-foreground-muted">
                  Total units: <strong className="text-foreground">{totalUnits(classLoads)}</strong> · {classLoads.length} block(s)
                </p>
              )}
              <div className="min-h-[200px] overflow-x-auto rounded border border-border bg-surface">
                {classLoads && classLoads.length > 0 ? (
                  <ScheduleGrid
                    loads={classLoads}
                    readOnly
                    wrapInScroll={false}
                    hourEnd={HOUR_END}
                    draggableIdPrefix="report-class"
                    fitWidth
                  />
                ) : classId && academicYearId ? (
                  <div className="flex items-center justify-center py-12 text-foreground-muted">
                    No schedule for this class in the selected term.
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12 text-foreground-muted">
                    Select academic year and class to view schedule.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>

        {/* Room report */}
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 font-medium text-foreground">Room report</h2>
          <p className="mb-3 text-sm text-foreground-muted">
            Room occupancy grid. Same view as in the Scheduler.
          </p>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-48 max-w-xs">
              <label className="mb-1 block text-sm font-medium text-foreground">Room</label>
              <SearchableSelect
                options={rooms.map((r) => ({
                  value: r.id,
                  label: `${r.name}${r.isLab ? " (Lab)" : ""} — cap. ${r.capacity}`,
                }))}
                value={roomId || "__none__"}
                onValueChange={(v) => setRoomId(v === "__none__" ? "" : v)}
                placeholder="Search room…"
                noneOption={{ value: "__none__", label: "Select room" }}
                aria-label="Room"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!roomId || !academicYearId}
              onClick={() => downloadReport(`/reports/room/${roomId}`, `room-${roomId}.pdf`)}
            >
              Download PDF
            </Button>
          </div>
          {roomLoadsLoading ? (
            <div className="flex justify-center py-12 rounded border border-border bg-surface-muted/30" aria-busy="true">
              <Spinner />
            </div>
          ) : roomLoads !== null && roomLoads.length >= 0 ? (
            <>
              {roomLoads.length > 0 && (
                <p className="mb-2 text-sm text-foreground-muted">
                  {roomLoads.length} block(s) in this room
                </p>
              )}
              <div className="min-h-[200px] overflow-x-auto rounded border border-border bg-surface">
                {roomLoads && roomLoads.length > 0 ? (
                  <ScheduleGrid
                    loads={roomLoads}
                    readOnly
                    wrapInScroll={false}
                    hourEnd={HOUR_END}
                    draggableIdPrefix="report-room"
                    fitWidth
                  />
                ) : roomId && academicYearId ? (
                  <div className="flex items-center justify-center py-12 text-foreground-muted">
                    No occupancy for this room in the selected term.
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12 text-foreground-muted">
                    Select academic year and room to view schedule.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>

        {/* College workload Excel */}
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 font-medium text-foreground">College workload (Excel)</h2>
          <p className="mb-4 text-sm text-foreground-muted">
            Complete faculty workload for the college for the selected academic year and semester.
          </p>
          <Button
            type="button"
            disabled={!academicYearId}
            onClick={() => downloadReport("/reports/college-workload", "college-workload.xlsx")}
          >
            Download Excel
          </Button>
        </section>
      </div>

      <p className="mt-6 text-sm text-foreground-muted">
        Reports require authentication. Download uses your session; schedule grids load data for the selected term.
      </p>
    </div>
  );
}
