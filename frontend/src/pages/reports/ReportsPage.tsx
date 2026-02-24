import { useState, useEffect } from "react";
import { apiClient } from "../../api/apiClient";
import type { AcademicYear } from "../../types/api";
import type { UserListItem } from "../../types/api";
import type { StudentClass } from "../../types/api";
import type { Room } from "../../types/api";
import toast from "react-hot-toast";
import { Select } from "../../components/ui/select";
import { Button } from "../../components/ui/button";

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
      <h1 className="text-2xl font-semibold text-foreground mb-4">Reports</h1>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Academic Year</label>
          <Select.Root value={academicYearId || "__none__"} onValueChange={(v) => setAcademicYearId(v === "__none__" ? "" : v)}>
            <Select.Trigger aria-label="Academic year" className="w-full">
              <Select.Value placeholder="Select" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="__none__">Select</Select.Item>
              {academicYears.map((y) => (
                <Select.Item key={y.id} value={y.id}>{y.name}</Select.Item>
              ))}
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
      </div>
      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="font-medium text-foreground mb-2">Faculty Report</h2>
          <p className="text-sm text-foreground-muted mb-3">PDF with weekly grid and total units.</p>
          <div className="mb-2">
            <Select.Root value={facultyId || "__none__"} onValueChange={(v) => setFacultyId(v === "__none__" ? "" : v)}>
              <Select.Trigger aria-label="Faculty" className="w-full">
                <Select.Value placeholder="Select faculty" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="__none__">Select faculty</Select.Item>
                {faculties.map((f) => (
                  <Select.Item key={f.id} value={f.id}>{f.name}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          <Button
            type="button"
            disabled={!facultyId || !academicYearId}
            onClick={() => downloadReport(`/reports/faculty/${facultyId}`, `faculty-${facultyId}.pdf`)}
          >
            Download PDF
          </Button>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="font-medium text-foreground mb-2">Student Class Report</h2>
          <p className="text-sm text-foreground-muted mb-3">PDF with class schedule and total units.</p>
          <div className="mb-2">
            <Select.Root value={classId || "__none__"} onValueChange={(v) => setClassId(v === "__none__" ? "" : v)}>
              <Select.Trigger aria-label="Student class" className="w-full">
                <Select.Value placeholder="Select class" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="__none__">Select class</Select.Item>
                {classes.map((c) => (
                  <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          <Button
            type="button"
            disabled={!classId || !academicYearId}
            onClick={() => downloadReport(`/reports/student-class/${classId}`, `class-${classId}.pdf`)}
          >
            Download PDF
          </Button>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="font-medium text-foreground mb-2">Room Report</h2>
          <p className="text-sm text-foreground-muted mb-3">PDF with room occupancy grid.</p>
          <div className="mb-2">
            <Select.Root value={roomId || "__none__"} onValueChange={(v) => setRoomId(v === "__none__" ? "" : v)}>
              <Select.Trigger aria-label="Room" className="w-full">
                <Select.Value placeholder="Select room" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="__none__">Select room</Select.Item>
                {rooms.map((r) => (
                  <Select.Item key={r.id} value={r.id}>{r.name}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          <Button
            type="button"
            disabled={!roomId || !academicYearId}
            onClick={() => downloadReport(`/reports/room/${roomId}`, `room-${roomId}.pdf`)}
          >
            Download PDF
          </Button>
        </div>
      </div>
      <p className="mt-4 text-sm text-foreground-muted">Reports require authentication. Download opens in a new request with your cookies.</p>
    </div>
  );
}
