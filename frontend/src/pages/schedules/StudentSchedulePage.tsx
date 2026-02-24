import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { FacultyLoad, AcademicYear, StudentClass } from "../../types/api";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";
import { Select } from "../../components/ui/select";
import { Spinner } from "../../components/ui/spinner";

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
      <h1 className="text-2xl font-semibold text-foreground mb-4">Student Class Schedule</h1>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Academic Year</label>
          <Select.Root value={academicYearId || "__none__"} onValueChange={(v) => setAcademicYearId(v === "__none__" ? "" : v)}>
            <Select.Trigger aria-label="Academic year" className="w-full">
              <Select.Value placeholder="Academic Year" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="__none__">Academic Year</Select.Item>
              {academicYears.map((y) => <Select.Item key={y.id} value={y.id}>{y.name}</Select.Item>)}
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
          <label className="mb-1 block text-sm font-medium text-foreground">Class</label>
          <Select.Root value={selectedClassId || "__none__"} onValueChange={(v) => setSelectedClassId(v === "__none__" ? "" : v)}>
            <Select.Trigger aria-label="Student class">
              <Select.Value placeholder="Select class" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="__none__">Select class</Select.Item>
              {classes.map((c) => <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>)}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : !selectedClassId ? (
        <p className="text-foreground-muted">Select a class.</p>
      ) : loads.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted">No schedule entries for this class. Change filters to see other data.</p>
        </div>
      ) : (
        <ScheduleGrid loads={loads} />
      )}
    </div>
  );
}
