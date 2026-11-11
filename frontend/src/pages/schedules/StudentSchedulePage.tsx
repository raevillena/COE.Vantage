import { useEffect, useState } from "react";
import { ShareScheduleDialog } from "../../components/schedules/ShareScheduleDialog";
import { schedulingTerm, yearLabel } from "../../utils/currentTerm";
import { apiClient } from "../../api/apiClient";
import type { FacultyLoad, AcademicYear, StudentClass, Department } from "../../types/api";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";
import { SearchableSelect } from "../../components/ui/searchableSelect";
import { departmentLabel } from "../../utils/departmentLabel";
import { Select } from "../../components/ui/select";
import { Spinner } from "../../components/ui/spinner";
import { RawBlocksEditor } from "../../components/scheduler/RawBlocksEditor";
import { useAppSelector } from "../../store/hooks";
import { useScheduleReleased } from "../../hooks/useScheduleReleased";
import { ScheduleHeldNotice } from "../../components/ui/scheduleHeldNotice";

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
  const [reloadKey, setReloadKey] = useState(0);
  const role = user?.role;
  // A faculty member only sees the classes where they teach, and only through the report endpoints.
  const isFaculty = role === "FACULTY";
  const released = useScheduleReleased(isFaculty, academicYearId, semester);
  const held = isFaculty && released !== true; // nothing until the college locks the term
  const needsDepartmentFilter = role === "ADMIN" || role === "DEAN" || role === "OFFICER" || role === "COLLEGE_SECRETARY" || role === "PRESIDENT" || role === "UNIT";

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
    if (isFaculty) {
      if (!academicYearId || held) {
        setClasses([]);
        return;
      }
      const mine = new URLSearchParams({ academicYearId, semester: String(semester) });
      apiClient
        .get<StudentClass[]>(`/reports/my/classes?${mine}`)
        .then(({ data }) => {
          setClasses(data ?? []);
          setSelectedClassId((cur) => ((data ?? []).some((c) => c.id === cur) ? cur : ""));
        })
        .catch(() => setClasses([]));
      return;
    }
    // Dean, college secretary, admin and officer see every department unless they pick one;
    // a chairman is always limited to their own department by the server.
    const params = new URLSearchParams();
    if (needsDepartmentFilter && departmentId) params.set("departmentId", departmentId);
    apiClient
      .get<StudentClass[]>(`/student-classes${params.toString() ? `?${params}` : ""}`)
      .then(({ data }) => setClasses(data ?? []))
      .catch(() => setClasses([]));
  }, [user, role, isFaculty, held, academicYearId, semester, needsDepartmentFilter, departmentId]);

  useEffect(() => {
    if (!academicYearId || !selectedClassId || held) {
      setLoads([]);
      return;
    }
    setLoading(true);
    if (isFaculty) {
      const q = new URLSearchParams({ academicYearId, semester: String(semester) });
      apiClient
        .get<{ loads: FacultyLoad[] }>(`/reports/student-class/${selectedClassId}/data?${q}`)
        .then(({ data }) => setLoads(data.loads ?? []))
        .catch(() => setLoads([]))
        .finally(() => setLoading(false));
      return;
    }
    const params = new URLSearchParams({ academicYearId, semester: String(semester), studentClassId: selectedClassId });
    apiClient.get<FacultyLoad[]>(`/faculty-loads?${params}`).then(({ data }) => setLoads(data)).finally(() => setLoading(false));
  }, [academicYearId, semester, selectedClassId, isFaculty, held, reloadKey]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Student Class Schedule</h1>
        <div className="flex flex-wrap items-center gap-2">
          {selectedClassId && role !== "FACULTY" && (
            <ShareScheduleDialog kind="CLASS" targetId={selectedClassId} subject={`${classes.find((c) => c.id === selectedClassId)?.name ?? "this class"} schedule`} />
          )}
          {role === "ADMIN" && selectedClassId && academicYearId && (
            <RawBlocksEditor loads={loads} canEdit semester={semester} academicYearId={academicYearId} onChanged={() => setReloadKey((k) => k + 1)} />
          )}
        </div>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {needsDepartmentFilter && (
          <div className="min-w-[220px]">
            <label className="mb-1 block text-sm font-medium text-foreground">Department</label>
            <SearchableSelect
              options={departments.map((d) => ({ value: d.id, label: departmentLabel(d) }))}
              value={departmentId || "__none__"}
              onValueChange={(v) => {
                const next = v === "__none__" ? "" : v;
                setDepartmentId(next);
                setSelectedClassId("");
              }}
              noneOption={{ value: "__none__", label: "All departments" }}
              placeholder="Search department…"
              aria-label="Department"
            />
          </div>
        )}
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
          <label className="mb-1 block text-sm font-medium text-foreground">Class</label>
          <SearchableSelect
            options={classes.map((c) => ({
              value: c.id,
              label: `${c.name}${needsDepartmentFilter && !departmentId && c.curriculum?.department?.code ? ` · ${c.curriculum.department.code}` : ""}`,
            }))}
            value={selectedClassId || "__none__"}
            onValueChange={(v) => setSelectedClassId(v === "__none__" ? "" : v)}
            noneOption={{ value: "__none__", label: "Select class" }}
            placeholder="Search class…"
            aria-label="Student class"
          />
        </div>
      </div>
      {held ? (
        <ScheduleHeldNotice />
      ) : loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : !selectedClassId ? (
        <p className="text-foreground-muted">
          {isFaculty && classes.length === 0 ? "You have no classes in this term." : "Select a class."}
        </p>
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
