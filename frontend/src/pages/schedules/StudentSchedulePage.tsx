import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { FacultyLoad, AcademicYear, StudentClass, Department } from "../../types/api";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";
import { SearchableSelect } from "../../components/ui/searchableSelect";
import { Select } from "../../components/ui/select";
import { Spinner } from "../../components/ui/spinner";
import { useAppSelector } from "../../store/hooks";

export function StudentSchedulePage() {
  const user = useAppSelector((s) => s.auth.user);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [loads, setLoads] = useState<FacultyLoad[]>([]);
  const [loading, setLoading] = useState(false);
  const role = user?.role;
  const needsDepartmentFilter = role === "ADMIN" || role === "DEAN" || role === "OFFICER";

  useEffect(() => {
    apiClient.get<AcademicYear[]>("/academic-years/for-schedules").then(({ data }) => {
      setAcademicYears(data);
      if (data.length >= 1) {
        const active = data.find((y) => y.isActive);
        setAcademicYearId(active?.id ?? data[0].id);
      }
    });
    if (needsDepartmentFilter) {
      apiClient.get<Department[]>("/departments").then(({ data }) => setDepartments(data ?? [])).catch(() => setDepartments([]));
    } else {
      setDepartments([]);
    }
  }, []);

  useEffect(() => {
    if (role === "CHAIRMAN" && user?.departmentId) {
      setDepartmentId(user.departmentId);
    }
  }, [role, user?.departmentId]);

  useEffect(() => {
    if (!user) return;
    if (needsDepartmentFilter && !departmentId) {
      setClasses([]);
      setSelectedClassId("");
      return;
    }
    const params = new URLSearchParams();
    if (needsDepartmentFilter && departmentId) params.set("departmentId", departmentId);
    apiClient
      .get<StudentClass[]>(`/student-classes${params.toString() ? `?${params}` : ""}`)
      .then(({ data }) => setClasses(data ?? []))
      .catch(() => setClasses([]));
  }, [user, role, needsDepartmentFilter, departmentId]);

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
        {needsDepartmentFilter && (
          <div className="min-w-[220px]">
            <label className="mb-1 block text-sm font-medium text-foreground">Department</label>
            <SearchableSelect
              options={departments.map((d) => ({ value: d.id, label: `${d.name}${d.code ? ` (${d.code})` : ""}` }))}
              value={departmentId || "__none__"}
              onValueChange={(v) => {
                const next = v === "__none__" ? "" : v;
                setDepartmentId(next);
                setSelectedClassId("");
              }}
              noneOption={{ value: "__none__", label: "Select department" }}
              placeholder="Search department…"
              aria-label="Department"
            />
          </div>
        )}
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
          <label className="mb-1 block text-sm font-medium text-foreground">Class</label>
          <SearchableSelect
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
            value={selectedClassId || "__none__"}
            onValueChange={(v) => setSelectedClassId(v === "__none__" ? "" : v)}
            noneOption={{ value: "__none__", label: "Select class" }}
            placeholder="Search class…"
            aria-label="Student class"
          />
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
