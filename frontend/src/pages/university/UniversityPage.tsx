import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { Spinner } from "../../components/ui/spinner";
import { HelpTip } from "../../components/ui/helpTip";
import { useAppSelector } from "../../store/hooks";
import { CollegePicture } from "../../components/ui/collegePicture";
import { SEMESTER_NAME } from "../../utils/termLock";

interface CollegeSummary {
  id: string;
  name: string;
  code: string | null;
  imageVersion: number | null;
  departments: number;
  users: number;
  studentClasses: number;
  rooms: number;
  subjects: number;
  curricula: number;
  blocksThisTerm: number;
  lockedSemesters: number[];
  currentTerm: { academicYearId: string; name: string; semester: number } | null;
}

interface Overview {
  university: { id: string; name: string };
  colleges: CollegeSummary[];
}

const STATS: { key: keyof CollegeSummary; label: string }[] = [
  { key: "departments", label: "Departments" },
  { key: "users", label: "People" },
  { key: "studentClasses", label: "Classes" },
  { key: "rooms", label: "Rooms" },
  { key: "subjects", label: "Subjects" },
  { key: "blocksThisTerm", label: "Blocks this term" },
];

/** The president's home (and the admin's): every college of the university, side by side. Read only. */
export function UniversityPage() {
  const role = useAppSelector((s) => s.auth.user?.role);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<Overview>("/university")
      .then(({ data: d }) => setData(d))
      .catch(() => toast.error("Could not load the university overview"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!data) return null;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-foreground">{data.university.name}</h1>
        <HelpTip>An overview of every college in the university. Each college has its own current term (or has not started), and blocks are counted for it. A lock means that college has finished its schedule for that semester.</HelpTip>
        {role === "ADMIN" && (
          <Link to="/colleges" className="ml-auto text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 rounded">
            Manage colleges
          </Link>
        )}
      </div>
      <p className="mb-6 text-sm text-foreground-muted">
        Each college sets its own current term.
        {(role === "PRESIDENT" || role === "UNIT") && " You can view everything here and change nothing."}
      </p>

      {data.colleges.length === 0 ? (
        <p className="rounded border border-border bg-surface p-8 text-center text-foreground-muted">There are no colleges yet.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.colleges.map((c) => (
            <li key={c.id} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
              <CollegePicture id={c.id} name={c.name} code={c.code} version={c.imageVersion} className="h-32 w-full" />
              <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-foreground">{c.name}</h2>
                  <p className="text-xs text-foreground-muted">
                    {c.currentTerm ? `${c.currentTerm.name}, ${SEMESTER_NAME[c.currentTerm.semester]}` : "Not started"}
                    {c.code ? ` · ${c.code}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {[1, 2, 3].map((sem) =>
                    c.lockedSemesters.includes(sem) ? (
                      <span
                        key={sem}
                        title={`${SEMESTER_NAME[sem]} is locked: the schedule is final`}
                        className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning-muted px-1.5 py-0.5 text-[11px] font-medium text-warning"
                      >
                        <Lock size={11} aria-hidden />
                        {SEMESTER_NAME[sem]}
                      </span>
                    ) : null
                  )}
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3">
                {STATS.map((s) => (
                  <div key={s.key}>
                    <dd className="text-xl font-semibold text-foreground">{c[s.key] as number}</dd>
                    <dt className="text-xs text-foreground-muted">{s.label}</dt>
                  </div>
                ))}
              </dl>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
