import { Spinner } from "../../ui/spinner";
import { HelpTip } from "../../ui/helpTip";
import { DAY_NAMES, hoursLabel, type ClassSubject, type ImportBlock, type PreviewResult } from "./geImportTypes";

interface Props {
  blocks: ImportBlock[];
  subjects: ClassSubject[];
  preview: PreviewResult | null;
  previewing: boolean;
  onChange: (key: string, patch: Partial<ImportBlock>) => void;
  warningsReviewed: boolean;
  onWarningsReviewed: (v: boolean) => void;
}

const fieldClass =
  "w-full rounded border border-border-strong bg-surface px-2 py-1 text-sm text-foreground focus:ring-2 focus:ring-focus-ring disabled:opacity-50";

export function GeReviewStep({ blocks, subjects, preview, previewing, onChange, warningsReviewed, onWarningsReviewed }: Props) {
  const byKey = new Map(preview?.blocks.map((b) => [b.key, b]));
  const subjectCode = (id: string) => subjects.find((s) => s.id === id)?.code ?? "";
  const newCount = preview?.blocks.filter((b) => b.state === "new").length ?? 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-foreground-muted">{blocks.length} blocks from the file, one per day.</span>
        {previewing && <Spinner />}
        {preview && !previewing && (
          <span className={preview.blockingCount > 0 ? "font-medium text-danger" : "font-medium text-success"}>
            {preview.blockingCount > 0
              ? `${preview.blockingCount} ${preview.blockingCount === 1 ? "block has" : "blocks have"} a problem to resolve`
              : "No conflicts to resolve"}
            {preview.warningCount > 0 ? `, ${preview.warningCount} with warnings` : ""}
          </span>
        )}
        <HelpTip>
          Times without AM or PM on the sheet were read as 7 AM to 6 PM, so check them. Problems in red must be fixed (change the day or time, or skip the block) before saving. Warnings in amber, such as a faculty name or room that may be used elsewhere, only need your review. Faculty and rooms stay as text because they belong to other colleges.
        </HelpTip>
      </div>

      <div className="overflow-x-auto rounded border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-surface-muted text-left text-xs font-medium text-foreground-muted">
            <tr>
              <th className="px-2 py-2">Add</th>
              <th className="px-2 py-2">Subject</th>
              <th className="px-2 py-2">Day</th>
              <th className="px-2 py-2">Start</th>
              <th className="px-2 py-2">End</th>
              <th className="px-2 py-2">Room</th>
              <th className="px-2 py-2">Faculty</th>
              <th className="px-2 py-2">Check</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {blocks.map((b) => {
              const res = byKey.get(b.key);
              const exists = res?.state === "exists";
              const label = `${subjectCode(b.subjectId)} ${DAY_NAMES[b.dayOfWeek]}`;
              return (
                <tr key={b.key} className={b.skip || exists ? "bg-surface-muted/40 text-foreground-muted" : res?.blocking.length ? "bg-danger-muted/30" : ""}>
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={!b.skip && !exists}
                      disabled={exists}
                      onChange={(e) => onChange(b.key, { skip: !e.target.checked })}
                      aria-label={`Add ${label}`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium">{subjectCode(b.subjectId)}</td>
                  <td className="px-2 py-1.5">
                    <select value={b.dayOfWeek} onChange={(e) => onChange(b.key, { dayOfWeek: Number(e.target.value) })} className={fieldClass} aria-label={`Day for ${label}`} disabled={b.skip}>
                      {[1, 2, 3, 4, 5, 6].map((d) => (
                        <option key={d} value={d}>{DAY_NAMES[d]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="time" value={b.startTime} onChange={(e) => onChange(b.key, { startTime: e.target.value })} className={fieldClass} aria-label={`Start for ${label}`} disabled={b.skip} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="time" value={b.endTime} onChange={(e) => onChange(b.key, { endTime: e.target.value })} className={fieldClass} aria-label={`End for ${label}`} disabled={b.skip} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={b.room} onChange={(e) => onChange(b.key, { room: e.target.value })} className={fieldClass} aria-label={`Room for ${label}`} disabled={b.skip} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={b.faculty} onChange={(e) => onChange(b.key, { faculty: e.target.value })} className={fieldClass} aria-label={`Faculty for ${label}`} disabled={b.skip} />
                  </td>
                  <td className="min-w-[14rem] px-2 py-1.5 text-xs">
                    {b.skip ? (
                      <span>Skipped</span>
                    ) : !res ? (
                      <span className="text-foreground-muted">Checking…</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {res.blocking.map((m) => (
                          <li key={m} className="text-danger">{m}</li>
                        ))}
                        {res.warnings.map((m) => (
                          <li key={m} className="text-warning">{m}</li>
                        ))}
                        {res.blocking.length === 0 && res.warnings.length === 0 && <li className="text-success">OK</li>}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview && preview.subjects.length > 0 && (
        <section className="mt-4" aria-label="Hours per subject">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Hours per week</h3>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {preview.subjects.map((s) => {
              const total = s.existingMinutes + s.importMinutes;
              const ok = total === s.requiredMinutes;
              return (
                <li key={s.subjectId} className={ok ? "text-foreground-muted" : "text-warning"}>
                  {s.code}: {hoursLabel(total)} of {hoursLabel(s.requiredMinutes)} required
                  {s.existingMinutes > 0 ? ` (${hoursLabel(s.existingMinutes)} already scheduled)` : ""}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {preview && preview.warningCount > 0 && (
        <label className="mt-4 flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={warningsReviewed} onChange={(e) => onWarningsReviewed(e.target.checked)} />
          I have reviewed the warnings ({preview.warningCount})
        </label>
      )}
      {preview && newCount === 0 && preview.blockingCount === 0 && (
        <p className="mt-3 text-sm text-foreground-muted">Everything here is already scheduled or skipped, so there is nothing to add.</p>
      )}
    </div>
  );
}
