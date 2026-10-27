import { useEffect, useState } from "react";
import { currentTerm } from "../../utils/currentTerm";
import { Link } from "react-router-dom";
import { apiClient } from "../../api/apiClient";
import type { AcademicYear, FacultyLoad } from "../../types/api";
import { useAppSelector } from "../../store/hooks";
import { MyWorkloadPanel } from "../../components/dashboard/MyWorkloadPanel";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";
import { SearchableSelect } from "../../components/ui/searchableSelect";
import { Select } from "../../components/ui/select";
import { Spinner } from "../../components/ui/spinner";

/** The dashboard for a faculty member: their own workload and weekly schedule, nothing else. */
export function FacultyDashboard() {
  const user = useAppSelector((s) => s.auth.user);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [loads, setLoads] = useState<FacultyLoad[]>([]);
  const [loadingGrid, setLoadingGrid] = useState(false);

  useEffect(() => {
    apiClient
      .get<AcademicYear[]>("/academic-years/for-schedules")
      .then(({ data }) => {
        setYears(data);
        const term = currentTerm(data);
        if (term) {
          setAcademicYearId(term.academicYearId);
          setSemester(term.semester);
        }
      })
      .catch(() => setYears([]));
  }, []);

  useEffect(() => {
    if (!academicYearId || !user) {
      setLoads([]);
      return;
    }
    let cancelled = false;
    setLoadingGrid(true);
    apiClient
      .get<{ loads: FacultyLoad[] }>(`/reports/faculty/${user.id}/data`, { params: { academicYearId, semester } })
      .then(({ data }) => !cancelled && setLoads(data.loads ?? []))
      .catch(() => !cancelled && setLoads([]))
      .finally(() => !cancelled && setLoadingGrid(false));
    return () => {
      cancelled = true;
    };
  }, [academicYearId, semester, user]);

  return (
    <section className="mb-8" aria-labelledby="my-term-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 id="my-term-heading" className="text-sm font-medium uppercase tracking-wide text-foreground-muted">
          My term
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-foreground-muted">Academic year</label>
            <SearchableSelect
              options={years.map((y) => ({ value: y.id, label: y.isActive ? `${y.name} (current)` : y.name }))}
              value={academicYearId || "__none__"}
              onValueChange={(v) => setAcademicYearId(v === "__none__" ? "" : v)}
              noneOption={{ value: "__none__", label: "Academic year" }}
              placeholder="Search academic year…"
              aria-label="Academic year"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground-muted">Semester</label>
            <Select.Root value={String(semester)} onValueChange={(v) => setSemester(Number(v))}>
              <Select.Trigger aria-label="Semester" className="w-[120px]">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="1">1st Sem</Select.Item>
                <Select.Item value="2">2nd Sem</Select.Item>
                <Select.Item value="3">Mid Year</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
        </div>
      </div>

      {academicYearId ? (
        <div className="space-y-4">
          <MyWorkloadPanel academicYearId={academicYearId} semester={semester} variant="full" />

          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium text-foreground">My weekly schedule</h2>
              <Link
                to="/reports"
                className="rounded text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              >
                Download my schedule and NOTA
              </Link>
            </div>
            {loadingGrid ? (
              <div className="flex justify-center py-8" aria-busy="true">
                <Spinner />
              </div>
            ) : loads.length === 0 ? (
              <p className="text-sm text-foreground-muted">No classes are assigned to you for this term.</p>
            ) : (
              <ScheduleGrid loads={loads} readOnly />
            )}
          </div>
        </div>
      ) : (
        <p className="rounded border border-border bg-surface p-4 text-sm text-foreground-muted">No academic year is available yet.</p>
      )}
    </section>
  );
}
