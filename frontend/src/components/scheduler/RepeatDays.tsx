import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { ConflictPreview, FacultyLoad } from "../../types/api";
import { getApiErrorMessage, getConflictSummary } from "../../types/api";
import toast from "react-hot-toast";

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DayState = { state: "checking" | "free" | "conflict" | "error"; reason?: string };

interface UseRepeatDaysOptions {
  /** Offer the repeat row (new block, or a saved block being edited). */
  enabled: boolean;
  /** Set when editing a saved block: its days with the same subject, class, faculty and time are loaded as ticked. */
  editingLoadId?: string | null;
  /** The block's own day; it cannot also be a repeat day. */
  primaryDay: number;
  /** True once faculty, subject, class, room and a valid time are filled in. */
  ready: boolean;
  /** Request body for the block on a given day (used for the conflict check and the create). */
  bodyForDay: (day: number) => Record<string, unknown>;
  /** Changes whenever anything the conflict check depends on changes, so newly ticked days are re-checked. */
  recheckKey: string;
}

/**
 * "Also repeat on" for a schedule block. Ticking a new day checks it with the same conflict preview as
 * the main block before it can be ticked. When editing, the block's other days (same subject, class,
 * faculty and time) show as ticked; unticking one removes that day's block on save, ticking a new one adds it.
 */
export function useRepeatDays({ enabled, editingLoadId, primaryDay, ready, bodyForDay, recheckKey }: UseRepeatDaysOptions) {
  const [days, setDays] = useState<number[]>([]);
  const [status, setStatus] = useState<Record<number, DayState>>({});
  /** Days that already have a saved block, mapped to that block's id (edit mode only). */
  const [existing, setExisting] = useState<Record<number, string>>({});
  const [loadingExisting, setLoadingExisting] = useState(false);
  const bodyRef = useRef(bodyForDay);
  bodyRef.current = bodyForDay;

  // Edit mode: find the same session on other days.
  useEffect(() => {
    setDays([]);
    setStatus({});
    setExisting({});
    if (!enabled || !editingLoadId) return;
    let cancelled = false;
    setLoadingExisting(true);
    (async () => {
      try {
        const { data: me } = await apiClient.get<FacultyLoad>(`/faculty-loads/${editingLoadId}`);
        const { data: all } = await apiClient.get<FacultyLoad[]>("/faculty-loads", {
          params: { studentClassId: me.studentClassId, academicYearId: me.academicYearId, semester: me.semester },
        });
        const sameFaculty = (l: FacultyLoad) =>
          me.facultyId
            ? l.facultyId === me.facultyId
            : !l.facultyId && (l.facultyDisplayName ?? "").trim().toLowerCase() === (me.facultyDisplayName ?? "").trim().toLowerCase();
        const map: Record<number, string> = {};
        for (const l of all) {
          if (l.id === me.id || l.subjectId !== me.subjectId || l.startTime !== me.startTime || l.endTime !== me.endTime) continue;
          if (!sameFaculty(l) || l.dayOfWeek < 1 || l.dayOfWeek > 6 || l.dayOfWeek === me.dayOfWeek) continue;
          map[l.dayOfWeek] = l.id;
        }
        if (cancelled) return;
        setExisting(map);
        setDays(Object.keys(map).map(Number).sort((a, b) => a - b));
      } catch {
        if (!cancelled) toast.error("Could not load this block's other days.");
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, editingLoadId]);

  const isNew = (d: number) => !(d in existing);

  const checkDay = async (day: number): Promise<DayState> => {
    try {
      const { data } = await apiClient.post<ConflictPreview>("/faculty-loads/preview", {
        ...bodyRef.current(day),
        // The block being edited must not conflict with itself (e.g. after moving its own day).
        ...(editingLoadId ? { excludeLoadId: editingLoadId } : {}),
      });
      const bad = data.facultyConflict || data.roomConflict || data.studentConflict || data.capacityIssue || data.labRoomMismatch;
      return bad ? { state: "conflict", reason: getConflictSummary(data) } : { state: "free" };
    } catch {
      return { state: "error", reason: "Could not check this day" };
    }
  };

  const toggle = async (day: number) => {
    if (days.includes(day)) {
      setDays((d) => d.filter((x) => x !== day));
      if (isNew(day)) setStatus(({ [day]: _gone, ...rest }) => rest);
      return;
    }
    if (!isNew(day)) {
      // Re-ticking a day that already has a saved block simply keeps it.
      setDays((d) => [...d, day].sort((a, b) => a - b));
      return;
    }
    if (!ready) {
      toast.error("Choose faculty, subject, class, room and a valid time first.");
      return;
    }
    setStatus((st) => ({ ...st, [day]: { state: "checking" } }));
    const result = await checkDay(day);
    if (result.state === "free") setDays((d) => [...d, day].sort((a, b) => a - b));
    // A day with a conflict is not added; the reason stays visible next to it.
    setStatus((st) => ({ ...st, [day]: result }));
  };

  const newDays = days.filter(isNew);

  // Drop the primary day when adding, and re-check newly ticked days whenever the block changes.
  useEffect(() => {
    if (!enabled) return;
    if (!editingLoadId && days.includes(primaryDay)) {
      setDays((d) => d.filter((x) => x !== primaryDay));
      setStatus(({ [primaryDay]: _gone, ...rest }) => rest);
      return;
    }
    if (newDays.length === 0) return;
    if (!ready) {
      setStatus((st) => {
        const next = { ...st };
        for (const d of newDays) next[d] = { state: "error", reason: "Complete the form to re-check" };
        return next;
      });
      return;
    }
    let cancelled = false;
    setStatus((st) => {
      const next = { ...st };
      for (const d of newDays) next[d] = { state: "checking" };
      return next;
    });
    void Promise.all(newDays.map(async (d) => [d, await checkDay(d)] as const)).then((results) => {
      if (cancelled) return;
      setStatus((st) => {
        const next = { ...st };
        for (const [d, r] of results) next[d] = r;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recheckKey, primaryDay, enabled, ready]);

  /** Days whose saved block will be deleted on save (edit mode, unticked). */
  const removeDays = Object.keys(existing).map(Number).filter((d) => !days.includes(d));

  /** Save is blocked while a newly ticked day is still checking or has a conflict. */
  const blocked = loadingExisting || newDays.some((d) => status[d]?.state !== "free");

  /** Number of block changes the repeat row will make on save (shown on the button). */
  const changeCount = newDays.length + removeDays.length;

  /** Add flow: creates the block on every ticked day. `first` is what the main save already produced. */
  const createRepeats = async (
    first: { requestCreated?: boolean } | undefined
  ): Promise<{ added: number; requests: number; failed: string[] }> => {
    let requests = first?.requestCreated ? 1 : 0;
    let added = first?.requestCreated ? 0 : 1;
    const failed: string[] = [];
    for (const day of newDays) {
      try {
        const res = await apiClient.post<{ requestCreated?: boolean }>("/faculty-loads", bodyRef.current(day));
        if (res.data?.requestCreated) requests += 1;
        else added += 1;
      } catch (err: unknown) {
        failed.push(`${DAY_NAMES[day - 1]}: ${getApiErrorMessage(err, "failed")}`);
      }
    }
    return { added, requests, failed };
  };

  /** Edit flow: adds the newly ticked days and deletes the blocks of unticked days. */
  const applyEdits = async (): Promise<{ added: number; requests: number; removed: number; failed: string[] }> => {
    let added = 0;
    let requests = 0;
    let removed = 0;
    const failed: string[] = [];
    for (const day of newDays) {
      try {
        const res = await apiClient.post<{ requestCreated?: boolean }>("/faculty-loads", bodyRef.current(day));
        if (res.data?.requestCreated) requests += 1;
        else added += 1;
      } catch (err: unknown) {
        failed.push(`${DAY_NAMES[day - 1]} not added: ${getApiErrorMessage(err, "failed")}`);
      }
    }
    for (const day of removeDays) {
      try {
        await apiClient.delete(`/faculty-loads/${existing[day]}`);
        removed += 1;
      } catch (err: unknown) {
        failed.push(`${DAY_NAMES[day - 1]} not removed: ${getApiErrorMessage(err, "failed")}`);
      }
    }
    return { added, requests, removed, failed };
  };

  const toastResult = (r: { added: number; requests: number; failed: string[] }) => {
    if (r.failed.length > 0) toast.error(`Saved ${r.added + r.requests} block(s); not saved: ${r.failed.join("; ")}`);
    else toast.success(`${r.added} block${r.added === 1 ? "" : "s"} added${r.requests ? `, ${r.requests} sent for approval` : ""}.`);
  };

  const toastEditResult = (r: { added: number; requests: number; removed: number; failed: string[] }) => {
    const parts = [
      r.added ? `${r.added} day${r.added === 1 ? "" : "s"} added` : "",
      r.requests ? `${r.requests} sent for approval` : "",
      r.removed ? `${r.removed} day${r.removed === 1 ? "" : "s"} removed` : "",
    ].filter(Boolean);
    if (r.failed.length > 0) toast.error(`${parts.join(", ") || "Block updated"}. ${r.failed.join("; ")}`);
    else toast.success(`Block updated${parts.length ? `: ${parts.join(", ")}` : ""}.`);
  };

  const rows = Array.from(new Set([...Object.keys(status).map(Number), ...Object.keys(existing).map(Number)])).sort((a, b) => a - b);

  const picker = enabled ? (
    <fieldset className="rounded border border-border p-2">
      <legend className="px-1 text-xs font-medium text-foreground-muted">
        {editingLoadId ? "Repeats on (untick to remove a day)" : "Also repeat on"}
      </legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {[1, 2, 3, 4, 5, 6].map((d) => {
          const isPrimary = d === primaryDay;
          return (
            <label
              key={d}
              className={`flex items-center gap-1 text-sm ${isPrimary ? "text-foreground-muted" : "text-foreground"}`}
              title={isPrimary ? "This is the day of the block" : undefined}
            >
              <input
                type="checkbox"
                checked={days.includes(d)}
                disabled={isPrimary || loadingExisting || status[d]?.state === "checking"}
                onChange={() => void toggle(d)}
                className="rounded border-border-strong focus:ring-focus-ring"
              />
              {DAY_NAMES[d - 1]}
            </label>
          );
        })}
      </div>
      {rows.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs" aria-live="polite">
          {rows.map((day) => {
            const saved = day in existing;
            const ticked = days.includes(day);
            const st = status[day];
            let text: string;
            let tone = "text-danger";
            if (saved) {
              text = ticked ? "saved" : "will be removed when you update";
              tone = ticked ? "text-foreground-muted" : "text-warning";
            } else if (!st || st.state === "checking") {
              text = "checking…";
              tone = "text-foreground-muted";
            } else if (st.state === "free") {
              text = "no conflicts, will be added";
              tone = "text-success";
            } else {
              text = `${st.reason ?? "conflict"}${ticked ? ". Untick or fix before saving." : ". Not added."}`;
            }
            return (
              <li key={day} className={tone}>
                {DAY_NAMES[day - 1]}: {text}
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  ) : null;

  return { days, blocked, picker, changeCount, existing, existingCount: Object.keys(existing).length, createRepeats, applyEdits, toastResult, toastEditResult };
}
