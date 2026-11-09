import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import type { Subject } from "../../types/api";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { SearchableSelect } from "../ui/searchableSelect";
import { labUnitsOf, lecUnitsOf } from "../../utils/subjectUnits";

interface CurriculumOption {
  id: string;
  name: string;
  departmentId?: string | null;
}

const EMPTY_FORM = { name: "", code: "", lecUnits: 3, labUnits: 0, yearLevel: "", curriculumId: "", departmentId: "" };

interface SubjectFormDialogProps {
  open: boolean;
  /** The subject to edit; null adds a new one. */
  subject: Subject | null;
  /** A new subject starts in this curriculum (and its department). */
  defaultCurriculumId?: string;
  onClose: () => void;
  /** Called after a save, with the curriculum the subject now belongs to ("" for none). */
  onSaved: (result: { created: boolean; curriculumId: string }) => void;
}

/** Add or edit a subject's details (name, units, year level, curriculum, department). Shared by the Subjects page and the Scheduler. */
export function SubjectFormDialog({ open, subject, defaultCurriculumId, onClose, onSaved }: SubjectFormDialogProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [curricula, setCurricula] = useState<CurriculumOption[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    apiClient.get<CurriculumOption[]>("/curriculum").then(({ data }) => setCurricula(data)).catch(() => setCurricula([]));
    apiClient.get<{ id: string; name: string }[]>("/departments").then(({ data }) => setDepartments(data)).catch(() => setDepartments([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (subject) {
      setForm({
        name: subject.name,
        code: subject.code,
        lecUnits: lecUnitsOf(subject),
        labUnits: labUnitsOf(subject),
        yearLevel: subject.yearLevel != null ? String(subject.yearLevel) : "",
        curriculumId: subject.curriculumId ?? "",
        departmentId: subject.departmentId ?? "",
      });
    } else {
      setForm({ ...EMPTY_FORM, curriculumId: defaultCurriculumId ?? "" });
    }
  }, [open, subject, defaultCurriculumId]);

  // A new subject also starts in its curriculum's department.
  useEffect(() => {
    if (!open || subject || !form.curriculumId || form.departmentId) return;
    const dept = curricula.find((c) => c.id === form.curriculumId)?.departmentId;
    if (dept) setForm((f) => (f.departmentId ? f : { ...f, departmentId: dept }));
  }, [open, subject, form.curriculumId, form.departmentId, curricula]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = form.name.trim();
    if (!nameTrimmed) {
      toast.error("Name is required");
      return;
    }
    if (form.lecUnits < 0 || form.labUnits < 0) {
      toast.error("Units cannot be negative");
      return;
    }
    try {
      // When creating: use custom code if provided, else derive from name. Normalize: spaces→hyphens, alphanumeric+hyphen only, uppercase, max 32 chars.
      const normalizeCode = (raw: string) =>
        raw.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9-]/g, "").toUpperCase().slice(0, 32) || undefined;
      const codeWhenCreating = subject
        ? undefined
        : (form.code.trim() ? normalizeCode(form.code) : normalizeCode(nameTrimmed)) || `SUB-${Date.now()}`;
      const payload = {
        ...(codeWhenCreating !== undefined && { code: codeWhenCreating }),
        name: nameTrimmed,
        lecUnits: form.lecUnits,
        labUnits: form.labUnits,
        yearLevel: form.yearLevel ? Number(form.yearLevel) : null,
        curriculumId: form.curriculumId || null,
        departmentId: form.departmentId || null,
      };
      if (subject) {
        await apiClient.patch(`/subjects/${subject.id}`, payload);
        toast.success("Subject updated");
      } else {
        await apiClient.post("/subjects", { ...payload, code: codeWhenCreating! });
        toast.success("Subject created");
      }
      onSaved({ created: !subject, curriculumId: form.curriculumId });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content title={subject ? "Edit Subject" : "Add Subject"}>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {subject ? (
            <p className="text-sm text-foreground-muted">
              <span className="font-medium text-foreground">Code: </span>
              {subject.code}
            </p>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Code</label>
              <input
                placeholder="e.g. MATH101 or leave empty to generate from name"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                aria-label="Subject code (optional)"
              />
              <p className="mt-1 text-[11px] text-foreground-muted">
                Optional. Uppercase letters, numbers, and hyphens only; max 32 characters. Empty = generated from name.
              </p>
            </div>
          )}
          <input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="subject-lec-units" className="mb-1 block text-sm font-medium text-foreground">Lecture units</label>
              <input id="subject-lec-units" type="number" min={0} value={form.lecUnits} onChange={(e) => setForm((f) => ({ ...f, lecUnits: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            </div>
            <div>
              <label htmlFor="subject-lab-units" className="mb-1 block text-sm font-medium text-foreground">Laboratory units</label>
              <input id="subject-lab-units" type="number" min={0} value={form.labUnits} onChange={(e) => setForm((f) => ({ ...f, labUnits: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            </div>
          </div>
          <p className="text-[11px] text-foreground-muted">
            Total {form.lecUnits + form.labUnits} {form.lecUnits + form.labUnits === 1 ? "unit" : "units"}. Needs {form.lecUnits + form.labUnits * 3} hrs/week of blocks and counts {form.lecUnits + form.labUnits * 3} units of faculty load (a laboratory unit is 3 hours). A laboratory-only subject must use a laboratory room.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Year level (within curriculum)</label>
            <input
              type="number"
              min={1}
              placeholder="e.g. 1, 2, 3, 4"
              value={form.yearLevel}
              onChange={(e) => setForm((f) => ({ ...f, yearLevel: e.target.value }))}
              className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            />
            <p className="mt-1 text-[11px] text-foreground-muted">
              Optional. Used to group subjects by year level in the scheduler for classes on this curriculum.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Curriculum</label>
            <SearchableSelect
              options={curricula.map((c) => ({ value: c.id, label: c.name }))}
              value={form.curriculumId || "__none__"}
              onValueChange={(v) =>
                setForm((f) => {
                  const id = v === "__none__" ? "" : v;
                  // choosing a curriculum fills in its department when none is chosen yet
                  const dept = id && !f.departmentId ? curricula.find((c) => c.id === id)?.departmentId ?? "" : f.departmentId;
                  return { ...f, curriculumId: id, departmentId: dept };
                })
              }
              noneOption={{ value: "__none__", label: "No curriculum" }}
              placeholder="Search curricula…"
              aria-label="Curriculum"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Department</label>
            <SearchableSelect
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              value={form.departmentId || "__none__"}
              onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v === "__none__" ? "" : v }))}
              noneOption={{ value: "__none__", label: "No department" }}
              placeholder="Search departments…"
              aria-label="Department"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
