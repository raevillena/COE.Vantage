import { useMemo, useState, useEffect } from "react";
import { apiClient } from "../../api/apiClient";
import type { ConflictPreview, FacultyLoad } from "../../types/api";
import { getApiErrorMessage, getConflictSummary } from "../../types/api";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { ScheduleGrid } from "../scheduleGrid/ScheduleGrid";

/** Parse "HH:mm" to minutes since midnight. */
function timeToMinutes(time: string): number {
  if (!time || typeof time !== "string") return 0;
  const parts = time.trim().split(":").map((p) => parseInt(p, 10));
  const h = Number.isNaN(parts[0]) ? 0 : Math.min(23, Math.max(0, parts[0]));
  const m = Number.isNaN(parts[1]) ? 0 : Math.min(59, Math.max(0, parts[1]));
  return h * 60 + m;
}

/** Compute compact hour range from loads so the grid has no empty rows beyond assigned times. */
function getCompactHourRange(loads: FacultyLoad[]): { hourStart: number; hourEnd: number } {
  const DEFAULT_START = 7;
  const DEFAULT_END = 18;
  if (!loads.length) return { hourStart: DEFAULT_START, hourEnd: DEFAULT_END };
  let minStart = 24;
  let maxEnd = 0;
  for (const load of loads) {
    const startM = timeToMinutes(load.startTime);
    const endM = timeToMinutes(load.endTime);
    const startH = Math.floor(startM / 60);
    const endH = Math.ceil(endM / 60);
    if (startH < minStart) minStart = startH;
    if (endH > maxEnd) maxEnd = endH;
  }
  const hourStart = Math.max(7, minStart - 1);
  const hourEnd = Math.min(21, maxEnd + 1);
  return { hourStart, hourEnd };
}

export interface AssignmentFormValues {
  facultyId: string;
  subjectId: string;
  studentClassId: string;
  roomId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface AssignmentFormProps {
  academicYearId: string;
  semester: number;
  initialValues: Partial<AssignmentFormValues>;
  /** Stable key that changes only when switching to a different assignment (edit vs pending). Stops sync from overwriting user's faculty/room selection on re-renders. */
  formKey: string;
  /** When editing a load, true only after the load has been fetched (so initialValues match the clicked block). Avoids syncing stale previous-load data on click. */
  initialValuesReady?: boolean;
  editingLoadId?: string | null;
  /** Live day/time from pending block (drag/resize) while adding a new assignment. Keeps the form's time fields in sync. */
  liveTime?: {
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
  };
  /** When set, overrides faculty schedule so it stays in sync with main grid after move/resize. */
  facultyLoadsOverride?: FacultyLoad[] | null;
  /** Called when faculty selection changes (for main grid availability overlay). */
  onFacultyIdChange?: (facultyId: string) => void;
  /** Called when room selection changes (for main grid availability overlay). */
  onRoomIdChange?: (roomId: string) => void;
  onSaved: () => void;
  onCancel: () => void;
}

export function AssignmentForm({
  academicYearId,
  semester,
  initialValues,
  formKey,
  initialValuesReady = true,
  editingLoadId,
  liveTime,
  facultyLoadsOverride,
  onFacultyIdChange,
  onRoomIdChange,
  onSaved,
  onCancel,
}: AssignmentFormProps) {
  const [facultyId, setFacultyId] = useState(initialValues.facultyId ?? "");
  const [subjectId, setSubjectId] = useState(initialValues.subjectId ?? "");
  const [studentClassId, setStudentClassId] = useState(initialValues.studentClassId ?? "");
  const [roomId, setRoomId] = useState(initialValues.roomId ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(initialValues.dayOfWeek ?? 1);
  const [startTime, setStartTime] = useState(initialValues.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(initialValues.endTime ?? "09:00");
  const [preview, setPreview] = useState<ConflictPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [faculties, setFaculties] = useState<{ id: string; name: string }[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; code: string; name: string; isLab: boolean }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; name: string; isLab: boolean }[]>([]);
  const [facultyLoads, setFacultyLoads] = useState<FacultyLoad[]>([]);
  const [facultyScheduleOpen, setFacultyScheduleOpen] = useState(true);

  // Sync from initialValues when formKey changes and data is ready. For edit mode, wait until the fetched load matches (initialValuesReady) so we don't show the previous block's data on click.
  useEffect(() => {
    if (!initialValuesReady) return;
    setFacultyId(initialValues.facultyId ?? "");
    setSubjectId(initialValues.subjectId ?? "");
    setStudentClassId(initialValues.studentClassId ?? "");
    setRoomId(initialValues.roomId ?? "");
    setDayOfWeek(initialValues.dayOfWeek ?? 1);
    setStartTime(initialValues.startTime ?? "08:00");
    setEndTime(initialValues.endTime ?? "09:00");
    setPreview(null);
  }, [formKey, initialValuesReady]);

  // While adding a new assignment (no editingLoadId), keep the form's day/time in sync with the pending block
  // when it is dragged or resized on the main grid.
  useEffect(() => {
    if (editingLoadId) return;
    if (!liveTime) return;
    if (liveTime.dayOfWeek != null && liveTime.dayOfWeek !== dayOfWeek) {
      setDayOfWeek(liveTime.dayOfWeek);
    }
    if (liveTime.startTime && liveTime.startTime !== startTime) {
      setStartTime(liveTime.startTime);
    }
    if (liveTime.endTime && liveTime.endTime !== endTime) {
      setEndTime(liveTime.endTime);
    }
  }, [editingLoadId, liveTime?.dayOfWeek, liveTime?.startTime, liveTime?.endTime, dayOfWeek, startTime, endTime]);

  useEffect(() => {
    apiClient.get("/users?role=FACULTY").then(({ data }) => setFaculties(data));
    apiClient.get("/subjects").then(({ data }) => setSubjects(data));
    apiClient.get("/student-classes").then(({ data }) => setClasses(data));
    apiClient.get("/rooms").then(({ data }) => setRooms(data));
  }, []);

  useEffect(() => {
    if (!facultyId || !academicYearId) {
      setFacultyLoads([]);
      return;
    }
    const params = new URLSearchParams({ academicYearId, semester: String(semester), facultyId });
    apiClient.get<FacultyLoad[]>(`/faculty-loads?${params}`).then(({ data }) => setFacultyLoads(data)).catch(() => setFacultyLoads([]));
  }, [facultyId, academicYearId, semester]);

  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const roomOptions = selectedSubject?.isLab ? rooms.filter((r) => r.isLab) : rooms;
  const displayFacultyLoads = facultyLoadsOverride ?? facultyLoads;
  const { hourStart, hourEnd } = useMemo(() => getCompactHourRange(displayFacultyLoads), [displayFacultyLoads]);

  /** Run conflict preview whenever assignment fields change (auto-check for room/faculty/class conflicts). */
  useEffect(() => {
    if (!facultyId || !subjectId || !studentClassId || !roomId || !academicYearId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    const body = {
      facultyId,
      subjectId,
      studentClassId,
      roomId,
      dayOfWeek,
      startTime,
      endTime,
      semester,
      academicYearId,
      ...(editingLoadId ? { excludeLoadId: editingLoadId } : {}),
    };
    apiClient
      .post<ConflictPreview>("/faculty-loads/preview", body)
      .then(({ data }) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not check for conflicts. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [facultyId, subjectId, studentClassId, roomId, dayOfWeek, startTime, endTime, academicYearId, semester, editingLoadId]);

  const runPreview = async () => {
    if (!facultyId || !subjectId || !studentClassId || !roomId) {
      toast.error("Fill all required fields");
      return;
    }
    setLoading(true);
    setPreview(null);
    try {
      const body = {
        facultyId,
        subjectId,
        studentClassId,
        roomId,
        dayOfWeek,
        startTime,
        endTime,
        semester,
        academicYearId,
        ...(editingLoadId ? { excludeLoadId: editingLoadId } : {}),
      };
      const { data } = await apiClient.post<ConflictPreview>("/faculty-loads/preview", body);
      setPreview(data);
    } catch {
      toast.error("Could not check for conflicts. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const hasConflict =
    preview &&
    (preview.facultyConflict ||
      preview.roomConflict ||
      preview.studentConflict ||
      preview.capacityIssue ||
      preview.labRoomMismatch);

  const handleSave = async () => {
    if (!preview) {
      await runPreview();
      return;
    }
    if (hasConflict && preview) {
      toast.error(`${getConflictSummary(preview)}. Fix before saving.`);
      return;
    }
    setLoading(true);
    try {
      if (editingLoadId) {
        await apiClient.patch(`/faculty-loads/${editingLoadId}`, {
          facultyId,
          subjectId,
          studentClassId,
          roomId,
          dayOfWeek,
          startTime,
          endTime,
          semester,
          academicYearId,
        });
        toast.success("Load updated");
      } else {
        await apiClient.post("/faculty-loads", {
          facultyId,
          subjectId,
          studentClassId,
          roomId,
          dayOfWeek,
          startTime,
          endTime,
          semester,
          academicYearId,
        });
        toast.success("Load added");
      }
      onSaved();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Save failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editingLoadId) return;
    setLoading(true);
    try {
      await apiClient.delete(`/faculty-loads/${editingLoadId}`);
      toast.success("Load removed");
      onSaved();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Delete failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Faculty</label>
        <Select.Root value={facultyId || "__none__"} onValueChange={(v) => { const id = v === "__none__" ? "" : v; setFacultyId(id); onFacultyIdChange?.(id); }}>
          <Select.Trigger aria-label="Faculty" className="w-full">
            <Select.Value placeholder="Select faculty" />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="__none__">Select faculty</Select.Item>
            {faculties.map((f) => (
              <Select.Item key={f.id} value={f.id}>
                {f.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Subject</label>
        <Select.Root value={subjectId || "__none__"} onValueChange={(v) => setSubjectId(v === "__none__" ? "" : v)}>
          <Select.Trigger aria-label="Subject" className="w-full">
            <Select.Value placeholder="Select subject" />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="__none__">Select subject</Select.Item>
            {subjects.map((s) => (
              <Select.Item key={s.id} value={s.id}>
                {s.code} {s.name} {s.isLab ? "(Lab)" : ""}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Student Class</label>
        <Select.Root value={studentClassId || "__none__"} onValueChange={(v) => setStudentClassId(v === "__none__" ? "" : v)}>
          <Select.Trigger aria-label="Student class" className="w-full">
            <Select.Value placeholder="Select class" />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="__none__">Select class</Select.Item>
            {classes.map((c) => (
              <Select.Item key={c.id} value={c.id}>
                {c.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Room</label>
        <Select.Root value={roomId || "__none__"} onValueChange={(v) => { const id = v === "__none__" ? "" : v; setRoomId(id); onRoomIdChange?.(id); }}>
          <Select.Trigger aria-label="Room" className="w-full">
            <Select.Value placeholder="Select room" />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="__none__">Select room</Select.Item>
            {roomOptions.map((r) => (
              <Select.Item key={r.id} value={r.id}>
                {r.name} {r.isLab ? "(Lab)" : ""}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Day</label>
        <Select.Root value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
          <Select.Trigger aria-label="Day of week" className="w-full">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {[1, 2, 3, 4, 5, 6].map((d) => (
              <Select.Item key={d} value={String(d)}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d - 1]}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>
      <div className="flex gap-2">
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="flex-1 rounded border border-border-strong px-3 py-2 text-sm focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
        />
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="flex-1 rounded border border-border-strong px-3 py-2 text-sm focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
        />
      </div>
      {(loading && !preview) && (
        <div className="rounded p-3 text-sm bg-surface-muted text-foreground-muted" role="status">
          Checking room &amp; faculty conflicts…
        </div>
      )}
      {preview && (
        <div
          className={`rounded p-3 text-sm ${hasConflict ? "bg-danger-muted text-danger" : "bg-success-muted text-success"}`}
          role="alert"
        >
          {hasConflict ? (
            <>
              {preview.facultyConflict && <div>Faculty has another class at this time.</div>}
              {preview.roomConflict && <div>Room is in use.</div>}
              {preview.studentConflict && <div>Student class has another class at this time.</div>}
              {preview.capacityIssue && <div>Room capacity is less than class size.</div>}
              {preview.labRoomMismatch && <div>Lab subject must use a lab room.</div>}
            </>
          ) : (
            <div>No conflicts. You can save.</div>
          )}
        </div>
      )}
      {facultyId && (
        <div className="flex flex-col min-h-0 flex-1 rounded border border-border bg-surface overflow-hidden">
          <button
            type="button"
            onClick={() => setFacultyScheduleOpen((o) => !o)}
            className="w-full flex items-center justify-between px-2 py-2 text-sm font-medium text-foreground hover:bg-surface-muted shrink-0"
          >
            <span>Faculty schedule</span>
            <span className="text-foreground-muted">{facultyScheduleOpen ? "▼" : "▶"}</span>
          </button>
          {facultyScheduleOpen && (
            <div className="border-t border-border flex-1 min-h-0 overflow-auto">
              <ScheduleGrid
                loads={displayFacultyLoads}
                readOnly
                wrapInScroll={false}
                hourStart={hourStart}
                hourEnd={hourEnd}
              />
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={loading || (preview !== null && Boolean(hasConflict))}
        >
          {loading ? "…" : editingLoadId ? "Update" : "Save"}
        </Button>
        {editingLoadId && (
          <Button type="button" variant="secondary" onClick={handleDelete} disabled={loading}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
