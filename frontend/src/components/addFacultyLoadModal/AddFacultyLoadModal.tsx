import { useState, useEffect } from "react";
import { apiClient } from "../../api/apiClient";
import type { ConflictPreview } from "../../types/api";
import { getApiErrorMessage, getConflictSummary } from "../../types/api";
import toast from "react-hot-toast";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Select } from "../ui/select";

interface AddFacultyLoadModalProps {
  academicYearId: string;
  semester: number;
  onClose: () => void;
  onSaved: () => void;
}

export function AddFacultyLoadModal({ academicYearId, semester, onClose, onSaved }: AddFacultyLoadModalProps) {
  const [facultyId, setFacultyId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [studentClassId, setStudentClassId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [preview, setPreview] = useState<ConflictPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [faculties, setFaculties] = useState<{ id: string; name: string }[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; code: string; name: string; isLab: boolean }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; name: string; isLab: boolean }[]>([]);

  useEffect(() => {
    apiClient.get("/users?role=FACULTY").then(({ data }) => setFaculties(data));
    apiClient.get("/subjects").then(({ data }) => setSubjects(data));
    apiClient.get("/student-classes").then(({ data }) => setClasses(data));
    apiClient.get("/rooms").then(({ data }) => setRooms(data));
  }, []);

  const runPreview = async () => {
    if (!facultyId || !subjectId || !studentClassId || !roomId) {
      toast.error("Fill all fields");
      return;
    }
    setLoading(true);
    setPreview(null);
    try {
      const { data } = await apiClient.post<ConflictPreview>("/faculty-loads/preview", {
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
      setPreview(data);
    } catch {
      toast.error("Could not check for conflicts. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const hasConflict = preview && (preview.facultyConflict || preview.roomConflict || preview.studentConflict || preview.capacityIssue || preview.labRoomMismatch);

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
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Save failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content title="Add Faculty Load" className="max-h-[90vh] overflow-y-auto">
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Faculty</label>
            <Select.Root value={facultyId || "__none__"} onValueChange={(v) => setFacultyId(v === "__none__" ? "" : v)}>
              <Select.Trigger aria-label="Faculty">
                <Select.Value placeholder="Select faculty" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="__none__">Select faculty</Select.Item>
                {faculties.map((f) => <Select.Item key={f.id} value={f.id}>{f.name}</Select.Item>)}
              </Select.Content>
            </Select.Root>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Subject</label>
            <Select.Root value={subjectId || "__none__"} onValueChange={(v) => setSubjectId(v === "__none__" ? "" : v)}>
              <Select.Trigger aria-label="Subject">
                <Select.Value placeholder="Select subject" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="__none__">Select subject</Select.Item>
                {subjects.map((s) => <Select.Item key={s.id} value={s.id}>{s.code} {s.name}</Select.Item>)}
              </Select.Content>
            </Select.Root>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Student Class</label>
            <Select.Root value={studentClassId || "__none__"} onValueChange={(v) => setStudentClassId(v === "__none__" ? "" : v)}>
              <Select.Trigger aria-label="Student class">
                <Select.Value placeholder="Select class" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="__none__">Select class</Select.Item>
                {classes.map((c) => <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>)}
              </Select.Content>
            </Select.Root>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Room</label>
            <Select.Root value={roomId || "__none__"} onValueChange={(v) => setRoomId(v === "__none__" ? "" : v)}>
              <Select.Trigger aria-label="Room">
                <Select.Value placeholder="Select room" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="__none__">Select room</Select.Item>
                {rooms.map((r) => <Select.Item key={r.id} value={r.id}>{r.name} {r.isLab ? " (Lab)" : ""}</Select.Item>)}
              </Select.Content>
            </Select.Root>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Day</label>
            <Select.Root value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
              <Select.Trigger aria-label="Day of week">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {[1, 2, 3, 4, 5, 6].map((d) => (
                  <Select.Item key={d} value={String(d)}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d - 1]}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          <div className="flex gap-2">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="flex-1 rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="flex-1 rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
          </div>
          {preview && (
            <div className={`rounded p-3 text-sm ${hasConflict ? "bg-danger-muted text-danger" : "bg-success-muted text-success"}`} role="alert">
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
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Dialog.Close asChild>
            <Button type="button" variant="secondary">Cancel</Button>
          </Dialog.Close>
          <Button type="button" variant="secondary" onClick={runPreview} disabled={loading}>Check conflicts</Button>
          <Button type="button" onClick={handleSave} disabled={loading || (preview !== null && Boolean(hasConflict))}>
            {loading ? "…" : "Save"}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
