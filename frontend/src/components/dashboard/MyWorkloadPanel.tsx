import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { HelpTip } from "../ui/helpTip";
import { Spinner } from "../ui/spinner";
import { LOAD_STATE_BADGE, LOAD_STATE_LABEL, ROLE_LABEL, type LoadState } from "../../utils/loadState";

export interface MyWorkload {
  empty: boolean;
  context: { academicYear: { id: string; name: string } | null; semester: number };
  person?: { id: string; name: string; role: string; status: string | null; department: string } | null;
  workload?: {
    assignedUnits: number;
    maxUnits: number | null;
    deloadTotal: number;
    deloading: { id: string; description: string; units: number }[];
    effectiveMax: number | null;
    difference: number | null;
    state: LoadState;
    percent: number | null;
  } | null;
  teaching?: { courses: number; blocks: number; contactHours: number };
}

function describe(w: NonNullable<MyWorkload["workload"]>): string {
  if (w.state === "over") return `${Math.abs(w.difference ?? 0)} units over your maximum for the term.`;
  if (w.state === "under") return `${Math.abs(w.difference ?? 0)} units below your maximum for the term.`;
  if (w.state === "full") return "You are at your maximum for the term.";
  return "No maximum units are set for you, so overload and underload cannot be judged.";
}

interface Props {
  academicYearId: string;
  semester: number;
  /** compact: a single card for people who also manage; full: details and deloading items. */
  variant?: "compact" | "full";
}

/** A person's own load: units assigned against their maximum less deloading, in colour (red overload, amber underload, green full). */
export function MyWorkloadPanel({ academicYearId, semester, variant = "full" }: Props) {
  const [data, setData] = useState<MyWorkload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!academicYearId) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    apiClient
      .get<MyWorkload>("/dashboard/me", { params: { academicYearId, semester } })
      .then(({ data: d }) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [academicYearId, semester]);

  if (loading) {
    return (
      <div className="flex justify-center rounded-lg border border-border bg-surface py-6" aria-busy="true">
        <Spinner />
      </div>
    );
  }
  if (failed || !data || data.empty || !data.workload || !data.person) {
    return variant === "full" ? (
      <p className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground-muted">Your workload could not be loaded.</p>
    ) : null;
  }
  const w = data.workload;
  const t = data.teaching;
  // A manager with no load and no maximum has nothing to show here.
  if (variant === "compact" && w.state === "unset" && w.assignedUnits === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm" aria-label="My workload">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="font-medium text-foreground">My workload</h2>
          <HelpTip>
            Units assigned to you this term against your maximum units less deloading. Laboratory units count three times. Red means more units than allowed, amber fewer, and green exactly the maximum.
          </HelpTip>
        </div>
        <span className={`rounded px-2 py-0.5 text-sm font-medium ${LOAD_STATE_BADGE[w.state]}`}>{LOAD_STATE_LABEL[w.state]}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-foreground-muted">Units assigned</dt>
          <dd className="text-2xl font-semibold tabular-nums text-foreground">{w.assignedUnits}</dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">Effective maximum</dt>
          <dd className="text-2xl font-semibold tabular-nums text-foreground">{w.effectiveMax ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">Maximum units</dt>
          <dd className="text-lg tabular-nums text-foreground">{w.maxUnits ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">Deloading</dt>
          <dd className="text-lg tabular-nums text-foreground">{w.deloadTotal}</dd>
        </div>
      </dl>

      {w.effectiveMax !== null && w.effectiveMax > 0 && (
        <div
          className="mt-3 h-2.5 overflow-hidden rounded bg-surface-muted"
          role="img"
          aria-label={`${w.assignedUnits} of ${w.effectiveMax} units assigned`}
        >
          <div
            className={`h-full rounded ${w.state === "over" ? "bg-danger" : w.state === "under" ? "bg-warning" : "bg-success"}`}
            style={{ width: `${Math.min(100, (w.assignedUnits / w.effectiveMax) * 100)}%` }}
          />
        </div>
      )}
      <p className="mt-2 text-sm text-foreground-muted">{describe(w)}</p>

      {variant === "full" && (
        <>
          {w.deloading.length > 0 && (
            <div className="mt-3">
              <h3 className="text-sm font-medium text-foreground">Deloading this term</h3>
              <ul className="mt-1 space-y-0.5 text-sm text-foreground-muted">
                {w.deloading.map((d) => (
                  <li key={d.id}>
                    {d.description} <span className="tabular-nums">(−{d.units})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {t && (
            <p className="mt-3 text-sm text-foreground-muted">
              {t.courses} {t.courses === 1 ? "course" : "courses"} · {t.blocks} weekly {t.blocks === 1 ? "block" : "blocks"} · {t.contactHours} contact hours per week ·{" "}
              {ROLE_LABEL[data.person.role] ?? data.person.role}
              {data.person.status ? `, ${data.person.status}` : ""}
            </p>
          )}
        </>
      )}
    </section>
  );
}
