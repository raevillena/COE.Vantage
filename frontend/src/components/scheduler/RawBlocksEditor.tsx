import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Code2 } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import { getApiErrorMessage } from "../../types/api";
import type { FacultyLoad } from "../../types/api";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { HOUR_END, HOUR_START, timeToMinutes } from "./scheduleGridConstants";

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const inputClass =
  "h-8 rounded border border-border-strong bg-surface px-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring disabled:opacity-60";

/** True when a block starts before or ends after the hours the scheduler normally works in, usually from a mistyped time. */
const isOddHour = (l: FacultyLoad) => timeToMinutes(l.startTime) < HOUR_START * 60 || timeToMinutes(l.endTime) > HOUR_END * 60;

/** HH:mm for a time input; the API keeps H:mm. */
const pad = (t: string) => (/^\d:/.test(t) ? `0${t}` : t);
const clock = (t: string) => t.replace(/^0/, "");

function Row({
  load,
  canEdit,
  semester,
  academicYearId,
  onChanged,
}: {
  load: FacultyLoad;
  canEdit: boolean;
  semester: number;
  academicYearId: string;
  onChanged: () => void;
}) {
  const [day, setDay] = useState(load.dayOfWeek);
  const [start, setStart] = useState(pad(load.startTime));
  const [end, setEnd] = useState(pad(load.endTime));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = day !== load.dayOfWeek || clock(start) !== clock(load.startTime) || clock(end) !== clock(load.endTime);
  const odd = isOddHour(load);

  const save = async () => {
    setBusy(true);
    try {
      await apiClient.patch(`/faculty-loads/${load.id}`, {
        facultyId: load.facultyId ?? undefined,
        facultyDisplayName: load.facultyDisplayName ?? undefined,
        subjectId: load.subjectId,
        studentClassId: load.studentClassId,
        roomId: load.roomId ?? undefined,
        roomDisplayName: load.roomDisplayName ?? undefined,
        dayOfWeek: day,
        startTime: clock(start),
        endTime: clock(end),
        semester,
        academicYearId,
      });
      toast.success("Block updated");
      onChanged();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not update the block"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await apiClient.delete(`/faculty-loads/${load.id}`);
      toast.success("Block removed");
      onChanged();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not remove the block"));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={`border-b border-border last:border-b-0 ${odd ? "bg-warning/10" : ""}`}>
      <td className="px-2 py-1.5 font-mono text-xs text-foreground">
        {load.subject?.code ?? "?"}
        {odd && <span className="ml-1.5 rounded bg-warning/25 px-1 py-px font-sans text-[10px] font-semibold text-foreground">odd hour</span>}
      </td>
      <td className="px-2 py-1.5 font-mono text-xs text-foreground-muted">{load.studentClass?.name ?? "—"}</td>
      <td className="px-2 py-1.5 font-mono text-xs text-foreground-muted">{load.faculty?.name ?? load.facultyDisplayName ?? "—"}</td>
      <td className="px-2 py-1.5 font-mono text-xs text-foreground-muted">{load.room?.name ?? load.roomDisplayName ?? "—"}</td>
      <td className="px-2 py-1.5">
        <select className={inputClass} value={day} onChange={(e) => setDay(Number(e.target.value))} disabled={!canEdit || busy} aria-label={`Day of ${load.subject?.code ?? "block"}`}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={d}>{DAYS[d]}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input type="time" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} disabled={!canEdit || busy} aria-label={`Start of ${load.subject?.code ?? "block"}`} />
      </td>
      <td className="px-2 py-1.5">
        <input type="time" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} disabled={!canEdit || busy} aria-label={`End of ${load.subject?.code ?? "block"}`} />
      </td>
      {canEdit && (
        <td className="whitespace-nowrap px-2 py-1.5 text-right">
          {dirty && (
            <Button size="xs" variant="secondary" className="mr-1" disabled={busy || !start || !end} onClick={save}>
              Save
            </Button>
          )}
          {confirmDelete ? (
            <>
              <Button size="xs" variant="danger" disabled={busy} onClick={remove}>Remove?</Button>
              <Button size="xs" variant="ghost" className="ml-1" disabled={busy} onClick={() => setConfirmDelete(false)}>No</Button>
            </>
          ) : (
            <Button size="xs" variant="dangerOutline" disabled={busy} onClick={() => setConfirmDelete(true)}>Remove</Button>
          )}
        </td>
      )}
    </tr>
  );
}

/**
 * Raw list of the blocks in the current schedule view, with their exact day and times, so a mistyped block (such as one
 * at 5 AM) can be found, corrected or removed. Blocks outside the usual hours are marked and sorted first.
 */
export function RawBlocksEditor({
  loads,
  canEdit,
  semester,
  academicYearId,
  onChanged,
}: {
  loads: FacultyLoad[];
  canEdit: boolean;
  semester: number;
  academicYearId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const rows = useMemo(
    () =>
      loads
        .filter((l) => !l.id.startsWith("pending-"))
        .sort((a, b) => Number(isOddHour(b)) - Number(isOddHour(a)) || a.dayOfWeek - b.dayOfWeek || timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
    [loads]
  );
  const odd = rows.filter(isOddHour);

  const removeOdd = async () => {
    setBulkBusy(true);
    try {
      await Promise.all(odd.map((l) => apiClient.delete(`/faculty-loads/${l.id}`)));
      toast.success(`Removed ${odd.length} ${odd.length === 1 ? "block" : "blocks"}`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Some blocks could not be removed"));
    } finally {
      setBulkBusy(false);
      setConfirmBulk(false);
      onChanged();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit blocks as a list"
        title="Raw blocks: find, correct or remove blocks by their exact times"
        className="relative inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 focus:ring-offset-surface"
      >
        <Code2 size={16} aria-hidden />
        Code
        {odd.length > 0 && <span className="h-2 w-2 rounded-full bg-warning" aria-label={`${odd.length} blocks at odd hours`} />}
      </button>
      {open && (
        <Dialog.Root open onOpenChange={(o) => !o && setOpen(false)}>
          <Dialog.Content
            title="Raw blocks"
            description={`The ${rows.length} ${rows.length === 1 ? "block" : "blocks"} in this view, with exact days and times.${canEdit ? "" : " Viewing only."}`}
            className="max-w-5xl max-h-[90vh] overflow-y-auto"
          >
            {odd.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
                <span>
                  {odd.length} {odd.length === 1 ? "block starts or ends" : "blocks start or end"} outside {HOUR_START}:00–{HOUR_END}:00. They are listed first.
                </span>
                {canEdit &&
                  (confirmBulk ? (
                    <span className="flex gap-1">
                      <Button size="xs" variant="danger" disabled={bulkBusy} onClick={removeOdd}>Remove {odd.length}?</Button>
                      <Button size="xs" variant="ghost" disabled={bulkBusy} onClick={() => setConfirmBulk(false)}>No</Button>
                    </span>
                  ) : (
                    <Button size="xs" variant="dangerOutline" onClick={() => setConfirmBulk(true)}>Remove all odd-hour blocks</Button>
                  ))}
              </div>
            )}
            {rows.length === 0 ? (
              <p className="mt-4 text-sm text-foreground-muted">There are no blocks in this view.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded border border-border">
                <table className="w-full text-left">
                  <thead className="border-b border-border bg-surface-hover text-[11px] uppercase tracking-wide text-foreground-muted">
                    <tr>
                      <th className="px-2 py-1.5">Subject</th>
                      <th className="px-2 py-1.5">Class</th>
                      <th className="px-2 py-1.5">Faculty</th>
                      <th className="px-2 py-1.5">Room</th>
                      <th className="px-2 py-1.5">Day</th>
                      <th className="px-2 py-1.5">Start</th>
                      <th className="px-2 py-1.5">End</th>
                      {canEdit && <th className="px-2 py-1.5" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((l) => (
                      <Row key={`${l.id}-${l.dayOfWeek}-${l.startTime}-${l.endTime}`} load={l} canEdit={canEdit} semester={semester} academicYearId={academicYearId} onChanged={onChanged} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      )}
    </>
  );
}
