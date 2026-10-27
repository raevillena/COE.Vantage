import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { getApiErrorMessage } from "../../types/api";
import type { AcademicYear } from "../../types/api";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { HelpTip } from "../ui/helpTip";
import { Spinner } from "../ui/spinner";
import { effectiveMax } from "../../utils/loadState";

export interface DeloadingItem {
  id?: string;
  description: string;
  units: string; // kept as text while typing
}

interface DeloadingDialogProps {
  person: { id: string; name: string; maxUnits?: number | null };
  years: AcademicYear[];
  academicYearId: string;
  semester: number;
  /** When false the dialog only shows the items. */
  canEdit: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const SEMESTERS = [
  { value: 1, label: "1st Sem" },
  { value: 2, label: "2nd Sem" },
  { value: 3, label: "Mid Year" },
];

/**
 * A person's deloading for one term: items with the units deducted from their maximum units.
 * Effective maximum = maximum units less the total; below it is underload, above it is overload.
 */
export function DeloadingDialog({ person, years, academicYearId, semester, canEdit, onClose, onSaved }: DeloadingDialogProps) {
  const [yearId, setYearId] = useState(academicYearId);
  const [sem, setSem] = useState(semester);
  const [items, setItems] = useState<DeloadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<{ userId: string; items: { id: string; description: string; units: number }[] }[]>("/deloadings", {
        params: { academicYearId: yearId, semester: sem },
      })
      .then(({ data }) => {
        if (cancelled) return;
        const mine = data.find((d) => d.userId === person.id);
        setItems((mine?.items ?? []).map((i) => ({ id: i.id, description: i.description, units: String(i.units) })));
      })
      .catch(() => !cancelled && toast.error("Could not load deloading"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [yearId, sem, person.id]);

  const total = items.reduce((sum, i) => sum + (Number(i.units) || 0), 0);
  const roundedTotal = Math.round(total * 100) / 100;
  const effective = effectiveMax(person.maxUnits, roundedTotal);
  const invalid = items.some((i) => !i.description.trim() || !(i.units.trim() !== "" && Number(i.units) >= 0));

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/deloadings/user/${person.id}`, {
        academicYearId: yearId,
        semester: sem,
        items: items.map((i) => ({ description: i.description.trim(), units: Number(i.units) })),
      });
      toast.success("Deloading saved");
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Could not save deloading"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content className="!max-w-xl max-h-[90vh] overflow-y-auto" title={`Deloading and assignments: ${person.name}`}>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="dl-ay" className="mb-1 block text-xs font-medium text-foreground-muted">Academic year</label>
            <select
              id="dl-ay"
              value={yearId}
              onChange={(e) => setYearId(e.target.value)}
              disabled={saving}
              className="rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.isActive ? `${y.name} (current)` : y.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dl-sem" className="mb-1 block text-xs font-medium text-foreground-muted">Semester</label>
            <select
              id="dl-sem"
              value={sem}
              onChange={(e) => setSem(Number(e.target.value))}
              disabled={saving}
              className="rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            >
              {SEMESTERS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <HelpTip>
            List the person's other assignments for the term, such as a designation, research or a thesis panel. The units of each are deducted from the maximum units (deloading). A regular assignment that does not reduce the load has 0 units. If the units assigned are below the reduced maximum the person is underloaded; above it, overloaded.
          </HelpTip>
        </div>

        {loading ? (
          <div className="flex justify-center py-8" aria-busy="true">
            <Spinner />
          </div>
        ) : (
          <>
            {items.length === 0 ? (
              <p className="mt-4 rounded border border-border bg-surface-muted/40 px-3 py-4 text-center text-sm text-foreground-muted">
                No assignments for this term.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {items.map((item, idx) => (
                  <li key={item.id ?? `new-${idx}`} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <label className="sr-only" htmlFor={`dl-desc-${idx}`}>Description</label>
                      <input
                        id={`dl-desc-${idx}`}
                        value={item.description}
                        onChange={(e) => setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, description: e.target.value } : p)))}
                        placeholder="e.g. Chairperson designation (SO no.)"
                        maxLength={200}
                        disabled={!canEdit || saving}
                        className="w-full rounded border border-border-strong px-3 py-2 text-sm focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 disabled:opacity-70"
                      />
                    </div>
                    <div className="w-24 shrink-0">
                      <label className="sr-only" htmlFor={`dl-units-${idx}`}>Units</label>
                      <input
                        id={`dl-units-${idx}`}
                        type="number"
                        min={0}
                        step="0.1"
                        value={item.units}
                        onChange={(e) => setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, units: e.target.value } : p)))}
                        placeholder="Deloading units"
                        disabled={!canEdit || saving}
                        className="w-full rounded border border-border-strong px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 disabled:opacity-70"
                      />
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={saving}
                        className="rounded px-2 py-2 text-sm text-foreground-muted hover:bg-danger-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-focus-ring"
                        aria-label={`Remove assignment ${idx + 1}`}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={saving || items.length >= 20}
                onClick={() => setItems((prev) => [...prev, { description: "", units: "" }])}
              >
                Add assignment
              </Button>
            )}

            <dl className="mt-4 grid grid-cols-3 gap-2 rounded border border-border bg-surface-muted/40 p-3 text-sm">
              <div>
                <dt className="text-xs text-foreground-muted">Maximum units</dt>
                <dd className="font-medium tabular-nums text-foreground">{person.maxUnits ?? "Not set"}</dd>
              </div>
              <div>
                <dt className="text-xs text-foreground-muted">Deloading</dt>
                <dd className="font-medium tabular-nums text-foreground">{roundedTotal}</dd>
              </div>
              <div>
                <dt className="text-xs text-foreground-muted">Effective maximum</dt>
                <dd className="font-semibold tabular-nums text-foreground">{effective ?? "—"}</dd>
              </div>
            </dl>
            {person.maxUnits == null && (
              <p className="mt-2 text-xs text-warning">No maximum units are set for this person, so overload and underload cannot be judged yet.</p>
            )}
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit && (
            <Button type="button" onClick={save} disabled={saving || loading || invalid}>
              {saving ? "…" : "Save"}
            </Button>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
