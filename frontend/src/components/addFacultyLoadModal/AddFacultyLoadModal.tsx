import { useState, useEffect } from "react";
import { apiClient } from "../../api/apiClient";
import type { ConflictPreview } from "../../types/api";
import toast from "react-hot-toast";

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
      toast.error("Preview failed");
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
    if (hasConflict) {
      toast.error("Fix conflicts before saving");
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
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-20">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Add Faculty Load</h2>
        <div className="space-y-3">
          <select required value={facultyId} onChange={(e) => setFacultyId(e.target.value)} className="w-full rounded border px-3 py-2">
            <option value="">Faculty</option>
            {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select required value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-full rounded border px-3 py-2">
            <option value="">Subject</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
          </select>
          <select required value={studentClassId} onChange={(e) => setStudentClassId(e.target.value)} className="w-full rounded border px-3 py-2">
            <option value="">Student Class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select required value={roomId} onChange={(e) => setRoomId(e.target.value)} className="w-full rounded border px-3 py-2">
            <option value="">Room</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} {r.isLab ? "(Lab)" : ""}</option>)}
          </select>
          <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className="w-full rounded border px-3 py-2">
            {[1, 2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d - 1]}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="flex-1 rounded border px-3 py-2" />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="flex-1 rounded border px-3 py-2" />
          </div>
          {preview && (
            <div className={`rounded p-3 text-sm ${hasConflict ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
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
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-4 py-2">Cancel</button>
          <button type="button" onClick={runPreview} disabled={loading} className="rounded border border-slate-400 px-4 py-2">Check conflicts</button>
          <button type="button" onClick={handleSave} disabled={loading || (preview !== null && Boolean(hasConflict))} className="rounded bg-slate-800 text-white px-4 py-2 disabled:opacity-50">
            {loading ? "…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
