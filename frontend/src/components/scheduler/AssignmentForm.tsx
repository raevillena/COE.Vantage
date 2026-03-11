import { useMemo, useState, useEffect } from "react";
import { apiClient } from "../../api/apiClient";
import type { ConflictPreview, FacultyLoad, Room } from "../../types/api";
import { getApiErrorMessage, getConflictSummary } from "../../types/api";
import toast from "react-hot-toast";
import { useAppSelector } from "../../store/hooks";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
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

/** Sentinel values: __others__ = off-system faculty (use facultyDisplayName); __off_system__ = off-system room (use roomDisplayName). */
export interface AssignmentFormValues {
  facultyId: string;
  facultyDisplayName?: string;
  subjectId: string;
  studentClassId: string;
  roomId: string;
  roomDisplayName?: string;
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
  /** Called when student class selection changes (for overlays in faculty view). */
  onStudentClassIdChange?: (studentClassId: string) => void;
  /** Whether to render the inline faculty schedule preview block below the form. Defaults to true. */
  showFacultySchedulePreview?: boolean;
  /** When true, lock the faculty select to the provided initial value (used in faculty view). */
  lockFaculty?: boolean;
  /** When true, lock the student class select to the provided initial value (used in class view). */
  lockStudentClass?: boolean;
  /** Room ID -> isOpen for current term; when room is closed and user is not control dept, room is disabled. */
  roomAvailabilityMap?: Record<string, boolean>;
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
  onStudentClassIdChange,
  showFacultySchedulePreview = true,
  lockFaculty = false,
  lockStudentClass = false,
  roomAvailabilityMap,
  onSaved,
  onCancel,
}: AssignmentFormProps) {
  const user = useAppSelector((s) => s.auth.user);
  const [facultyId, setFacultyId] = useState(initialValues.facultyId ?? "");
  const [facultyDisplayName, setFacultyDisplayName] = useState(initialValues.facultyDisplayName ?? "");
  const [subjectId, setSubjectId] = useState(initialValues.subjectId ?? "");
  const [studentClassId, setStudentClassId] = useState(initialValues.studentClassId ?? "");
  const [roomId, setRoomId] = useState(initialValues.roomId ?? "");
  const [roomDisplayName, setRoomDisplayName] = useState(initialValues.roomDisplayName ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(initialValues.dayOfWeek ?? 1);
  const [startTime, setStartTime] = useState(initialValues.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(initialValues.endTime ?? "09:00");
  const [preview, setPreview] = useState<ConflictPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [faculties, setFaculties] = useState<{ id: string; name: string }[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; code: string; name: string; isLab: boolean }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [facultyLoads, setFacultyLoads] = useState<FacultyLoad[]>([]);
  const [facultyScheduleOpen, setFacultyScheduleOpen] = useState(true);

  const isOthersFaculty = facultyId === "__others__";
  const isOffSystemRoom = roomId === "__off_system__";

  const facultyEmpty =
    !facultyId ||
    facultyId === "__none__" ||
    (facultyId === "__others__" && !facultyDisplayName?.trim());
  const subjectEmpty = !subjectId;
  const studentClassEmpty = !studentClassId;
  const roomEmpty = !roomId || roomId === "__none__";
  const requiredFieldClass =
    "border-danger ring-2 ring-danger/30 focus:ring-danger/50";

  // Sync from initialValues when formKey changes and data is ready. For edit mode, wait until the fetched load matches (initialValuesReady) so we don't show the previous block's data on click.
  useEffect(() => {
    if (!initialValuesReady) return;
    setFacultyId(initialValues.facultyId ?? "");
    setFacultyDisplayName(initialValues.facultyDisplayName ?? "");
    setSubjectId(initialValues.subjectId ?? "");
    setStudentClassId(initialValues.studentClassId ?? "");
    setRoomId(initialValues.roomId ?? "");
    setRoomDisplayName(initialValues.roomDisplayName ?? "");
    setDayOfWeek(initialValues.dayOfWeek ?? 1);
    setStartTime(initialValues.startTime ?? "08:00");
    setEndTime(initialValues.endTime ?? "09:00");
    setPreview(null);
  }, [formKey, initialValuesReady, initialValues.facultyId, initialValues.facultyDisplayName, initialValues.roomId, initialValues.roomDisplayName]);

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
    if (!facultyId || facultyId === "__others__" || !academicYearId) {
      setFacultyLoads([]);
      return;
    }
    const params = new URLSearchParams({ academicYearId, semester: String(semester), facultyId });
    apiClient.get<FacultyLoad[]>(`/faculty-loads?${params}`).then(({ data }) => setFacultyLoads(data)).catch(() => setFacultyLoads([]));
  }, [facultyId, academicYearId, semester]);

  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const roomOptions = selectedSubject?.isLab ? rooms.filter((r) => r.isLab) : rooms;
  const roomOptionDisabled = (r: Room) => {
    if (!r.controlDepartmentId) return false;
    const isOpen = roomAvailabilityMap?.[r.id] === true;
    if (isOpen) return false;
    if (user?.role !== "CHAIRMAN") return false;
    return user.departmentId !== r.controlDepartmentId;
  };
  const displayFacultyLoads = facultyLoadsOverride ?? facultyLoads;
  const { hourStart, hourEnd } = useMemo(() => getCompactHourRange(displayFacultyLoads), [displayFacultyLoads]);

  /** Run conflict preview whenever assignment fields change (auto-check for room/faculty/class conflicts). */
  useEffect(() => {
    const effectiveFacultyId = isOthersFaculty ? null : facultyId;
    const effectiveRoomId = isOffSystemRoom ? null : roomId;
    if ((!effectiveFacultyId && !facultyDisplayName?.trim()) || !subjectId || !studentClassId || (effectiveRoomId === "" && !roomDisplayName?.trim()) || !academicYearId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    const body = {
      facultyId: effectiveFacultyId || null,
      facultyDisplayName: isOthersFaculty ? (facultyDisplayName?.trim() || null) : null,
      subjectId,
      studentClassId,
      roomId: effectiveRoomId || null,
      roomDisplayName: isOffSystemRoom ? (roomDisplayName?.trim() || "Off-system") : null,
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
  }, [facultyId, facultyDisplayName, isOthersFaculty, subjectId, studentClassId, roomId, roomDisplayName, isOffSystemRoom, dayOfWeek, startTime, endTime, academicYearId, semester, editingLoadId]);

  const runPreview = async () => {
    const hasFaculty = (!isOthersFaculty && facultyId) || (isOthersFaculty && facultyDisplayName?.trim());
    const hasRoom = (!isOffSystemRoom && roomId) || isOffSystemRoom;
    if (!hasFaculty || !subjectId || !studentClassId || !hasRoom) {
      toast.error("Fill all required fields (faculty, subject, class, room or display names)");
      return;
    }
    setLoading(true);
    setPreview(null);
    try {
      const body = {
        facultyId: isOthersFaculty ? null : (facultyId || null),
        facultyDisplayName: isOthersFaculty ? (facultyDisplayName?.trim() || null) : null,
        subjectId,
        studentClassId,
        roomId: isOffSystemRoom ? null : (roomId || null),
        roomDisplayName: isOffSystemRoom ? (roomDisplayName?.trim() || "Off-system") : null,
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
    const hasFaculty = (!isOthersFaculty && facultyId) || (isOthersFaculty && facultyDisplayName?.trim());
    const hasRoom = (!isOffSystemRoom && roomId) || isOffSystemRoom; // off-system room allows empty display name (we default to "Off-system")
    if (!hasFaculty || !subjectId || !studentClassId || !hasRoom) {
      toast.error("Fill all required fields");
      return;
    }
    if (!preview) {
      await runPreview();
      return;
    }
    if (hasConflict && preview) {
      toast.error(`${getConflictSummary(preview)}. Fix before saving.`);
      return;
    }
    setLoading(true);
    const payload = {
      facultyId: isOthersFaculty ? null : (facultyId || null),
      facultyDisplayName: isOthersFaculty ? (facultyDisplayName?.trim() || null) : null,
      subjectId,
      studentClassId,
      roomId: isOffSystemRoom ? null : (roomId || null),
      roomDisplayName: isOffSystemRoom ? (roomDisplayName?.trim() || "Off-system") : null,
      dayOfWeek,
      startTime,
      endTime,
      semester,
      academicYearId,
    };
    try {
      if (editingLoadId) {
        await apiClient.patch(`/faculty-loads/${editingLoadId}`, payload);
        toast.success("Load updated");
      } else {
        const { data } = await apiClient.post<{ requestCreated?: boolean; id?: string }>("/faculty-loads", payload);
        if (data?.requestCreated) {
          toast.success("Request sent to the faculty's department chairman for approval.");
        } else {
          toast.success("Load added");
        }
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
        <Select.Root
          value={facultyId || "__none__"}
          onValueChange={(v) => {
            if (lockFaculty) return;
            const id = v === "__none__" ? "" : v;
            setFacultyId(id);
            onFacultyIdChange?.(id === "__others__" ? "" : id);
          }}
        >
        <Select.Trigger
          aria-label="Faculty"
          className={`w-full ${facultyEmpty ? requiredFieldClass : ""}`}
          disabled={lockFaculty}
        >
            <Select.Value placeholder="Select faculty" />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="__none__">Select faculty</Select.Item>
            <Select.Item value="__others__">Others (off-system)</Select.Item>
            {faculties.map((f) => (
              <Select.Item key={f.id} value={f.id}>
                {f.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        {isOthersFaculty && (
          <Input
            className="mt-1"
            placeholder="Type faculty name"
            value={facultyDisplayName}
            onChange={(e) => setFacultyDisplayName(e.target.value)}
            aria-label="Faculty display name"
            error={!facultyDisplayName?.trim()}
          />
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Subject</label>
        <Select.Root value={subjectId || "__none__"} onValueChange={(v) => setSubjectId(v === "__none__" ? "" : v)}>
          <Select.Trigger
            aria-label="Subject"
            className={`w-full ${subjectEmpty ? requiredFieldClass : ""}`}
          >
            <Select.Value placeholder="Select subject" />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="__none__">Select subject</Select.Item>
            {subjects.map((s) => (
              <Select.Item key={s.id} value={s.id} title={s.name}>
                {s.code} <span className="truncate">{s.name}</span>{s.isLab ? " (Lab)" : ""}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Student Class</label>
        <Select.Root
          value={studentClassId || "__none__"}
          onValueChange={(v) => {
            if (lockStudentClass) return;
            const id = v === "__none__" ? "" : v;
            setStudentClassId(id);
            onStudentClassIdChange?.(id);
          }}
        >
          <Select.Trigger
            aria-label="Student class"
            className={`w-full ${studentClassEmpty ? requiredFieldClass : ""}`}
            disabled={lockStudentClass}
          >
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
        <Select.Root
          value={roomId || "__none__"}
          onValueChange={(v) => {
            const id = v === "__none__" ? "" : v;
            setRoomId(id);
            onRoomIdChange?.(id === "__off_system__" ? "" : id);
          }}
        >
          <Select.Trigger
            aria-label="Room"
            className={`w-full ${roomEmpty ? requiredFieldClass : ""}`}
          >
            <Select.Value placeholder="Select room" />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="__none__">Select room</Select.Item>
            <Select.Item value="__off_system__">Off-system / Other</Select.Item>
            {roomOptions.map((r) => {
              const disabled = roomOptionDisabled(r);
              return (
                <Select.Item
                  key={r.id}
                  value={r.id}
                  disabled={disabled}
                  title={disabled ? "Room closed for this term; only the control department can assign until they open it." : undefined}
                >
                  {r.name} {r.isLab ? "(Lab)" : ""}
                </Select.Item>
              );
            })}
          </Select.Content>
        </Select.Root>
        {isOffSystemRoom && (
          <Input
            className="mt-1"
            placeholder="Room or location (optional)"
            value={roomDisplayName}
            onChange={(e) => setRoomDisplayName(e.target.value)}
            aria-label="Room display name"
          />
        )}
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
      {showFacultySchedulePreview && facultyId && (
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
