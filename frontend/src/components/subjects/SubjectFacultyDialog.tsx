import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import type { AcademicYear, Subject } from "../../types/api";
import { currentTerm } from "../../utils/currentTerm";
import {
  PrioritizedFacultyModal,
  type FacultyWithDepartment,
  type PrioritizedFacultyItem,
} from "../../pages/subjects/PrioritizedFacultyModal";

interface Term {
  academicYearId: string;
  semester: number;
}

interface SubjectFacultyDialogProps {
  /** The subject whose possible faculty are set; null keeps the dialog closed. */
  subject: Subject | null;
  /** Term to open on; without it the current term (or the subject's own semester) is used. */
  defaultTerm?: Term;
  onClose: () => void;
}

/** Possible (prioritized) faculty of a subject for one term. Shared by the Subjects page and the Scheduler. */
export function SubjectFacultyDialog({ subject, defaultTerm, onClose }: SubjectFacultyDialogProps) {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [list, setList] = useState<PrioritizedFacultyItem[]>([]);
  const [allFaculty, setAllFaculty] = useState<FacultyWithDepartment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Loads one subject's faculty list for one term (the list is per academic year + semester). */
  const loadList = async (s: Subject, forTerm: Term) => {
    setList([]);
    setLoading(true);
    try {
      const [priRes, facRes] = await Promise.all([
        apiClient.get<{ facultyId: string; name: string; email: string; priority: number }[]>(`/subjects/${s.id}/prioritized-faculty`, { params: forTerm }),
        apiClient.get<FacultyWithDepartment[]>("/users?role=FACULTY"),
      ]);
      setList((priRes.data ?? []).map((p, i) => ({ ...p, priority: i })));
      setAllFaculty(facRes.data ?? []);
    } catch {
      toast.error("Failed to load");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!subject) return;
    let cancelled = false;
    setAllFaculty([]);
    (async () => {
      let years = academicYears;
      if (years.length === 0) {
        try {
          years = (await apiClient.get<AcademicYear[]>("/academic-years/for-schedules")).data;
        } catch {
          years = [];
        }
        if (cancelled) return;
        setAcademicYears(years);
      }
      const current = currentTerm(years);
      if (!defaultTerm && !current) {
        toast.error("No academic year available");
        onClose();
        return;
      }
      // A subject offered in one semester opens on it; one offered in both opens on the current semester.
      const start = defaultTerm ?? { academicYearId: current!.academicYearId, semester: subject.semester ?? current!.semester };
      setTerm(start);
      await loadList(subject, start);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  const changeTerm = (next: Term) => {
    setTerm(next);
    if (subject) void loadList(subject, next);
  };

  const save = async (facultyIds: string[]) => {
    if (!subject || !term) return;
    setSaving(true);
    try {
      await apiClient.put(`/subjects/${subject.id}/prioritized-faculty`, { facultyIds, ...term });
      toast.success("Prioritized faculty updated");
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PrioritizedFacultyModal
      subject={subject}
      open={subject !== null}
      onOpenChange={(open) => !open && onClose()}
      initialPriorityList={list}
      allFaculty={allFaculty}
      onSave={save}
      saving={saving}
      loading={loading}
      termControls={
        term && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="pf-ay" className="mb-1 block text-xs font-medium text-foreground-muted">Academic year</label>
              <select
                id="pf-ay"
                value={term.academicYearId}
                onChange={(e) => changeTerm({ ...term, academicYearId: e.target.value })}
                disabled={loading || saving}
                className="rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              >
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>{y.isActive ? `${y.name} (current)` : y.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pf-sem" className="mb-1 block text-xs font-medium text-foreground-muted">Semester</label>
              <select
                id="pf-sem"
                value={term.semester}
                onChange={(e) => changeTerm({ ...term, semester: Number(e.target.value) })}
                disabled={loading || saving}
                className="rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              >
                <option value={1}>1st Sem</option>
                <option value={2}>2nd Sem</option>
                <option value={3}>Mid Year</option>
              </select>
            </div>
          </div>
        )
      }
      termLabel={term ? `${academicYears.find((y) => y.id === term.academicYearId)?.name ?? ""} · ${["", "1st Sem", "2nd Sem", "Mid Year"][term.semester]}` : undefined}
    />
  );
}
