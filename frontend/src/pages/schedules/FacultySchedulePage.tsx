import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { FacultyLoad, AcademicYear, UserListItem } from "../../types/api";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";
import { SearchableSelect } from "../../components/ui/searchableSelect";
import { Select } from "../../components/ui/select";
import { Spinner } from "../../components/ui/spinner";

export function FacultySchedulePage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [faculties, setFaculties] = useState<UserListItem[]>([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
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
    apiClient
      .get<UserListItem[]>("/users")
      .then(({ data }) => setFaculties((data ?? []).filter((u) => u.role === "FACULTY" || u.role === "CHAIRMAN")))
      .catch(() => setFaculties([]));
  }, []);

  useEffect(() => {
    if (!academicYearId || !selectedFacultyId) {
      setLoads([]);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ academicYearId, semester: String(semester), facultyId: selectedFacultyId });
    apiClient.get<FacultyLoad[]>(`/faculty-loads?${params}`).then(({ data }) => setLoads(data)).finally(() => setLoading(false));
  }, [academicYearId, semester, selectedFacultyId]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-4">Faculty Schedule</h1>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Academic Year</label>
          <SearchableSelect
            options={academicYears.map((y) => ({ value: y.id, label: y.isActive ? `${y.name} (current)` : y.name }))}
            value={academicYearId || "__none__"}
            onValueChange={(v) => setAcademicYearId(v === "__none__" ? "" : v)}
            noneOption={{ value: "__none__", label: "Academic Year" }}
            placeholder="Search academic year…"
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
        <div className="min-w-[200px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Faculty</label>
          <SearchableSelect
            options={faculties.map((f) => ({ value: f.id, label: f.name }))}
            value={selectedFacultyId || "__none__"}
            onValueChange={(v) => setSelectedFacultyId(v === "__none__" ? "" : v)}
            noneOption={{ value: "__none__", label: "Select faculty" }}
            placeholder="Search faculty…"
            aria-label="Faculty"
          />
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : !selectedFacultyId ? (
        <p className="text-foreground-muted">Select a faculty.</p>
      ) : loads.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted">No schedule entries for this faculty. Change filters to see other data.</p>
        </div>
      ) : (
        <ScheduleGrid loads={loads} />
      )}
    </div>
  );
}
