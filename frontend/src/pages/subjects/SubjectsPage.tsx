import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { AcademicYear, Subject } from "../../types/api";
import toast from "react-hot-toast";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { SearchableSelect } from "../../components/ui/searchableSelect";
import { MoreVertical, Pencil } from "lucide-react";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";
import { useAppSelector } from "../../store/hooks";
import {
  PrioritizedFacultyModal,
  type FacultyWithDepartment,
  type PrioritizedFacultyItem,
} from "./PrioritizedFacultyModal";

export function SubjectsPage() {
  /** The college secretary can view everything the dean can but never change it. */
  const readOnly = useAppSelector((st) => st.auth.user?.role) === "COLLEGE_SECRETARY";
  const [list, setList] = useState<Subject[]>([]);
  /** "" = all curricula, "__none__" = subjects without a curriculum, otherwise a curriculum id. */
  const [curriculumFilter, setCurriculumFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    units: 3,
    isLab: false,
    yearLevel: "",
    curriculumId: "",
    departmentId: "",
  });
  const [curricula, setCurricula] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [prioritySubject, setPrioritySubject] = useState<Subject | null>(null);
  const [priorityList, setPriorityList] = useState<PrioritizedFacultyItem[]>([]);
  const [allFaculty, setAllFaculty] = useState<FacultyWithDepartment[]>([]);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [priorityTerm, setPriorityTerm] = useState<{ academicYearId: string; semester: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<Subject[]>("/subjects");
      setList(data);
    } catch {
      toast.error("Failed to load subjects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    apiClient.get("/curriculum").then(({ data }) => setCurricula(data));
    apiClient.get("/departments").then(({ data }) => setDepartments(data));
    apiClient.get<AcademicYear[]>("/academic-years/for-schedules").then(({ data }) => setAcademicYears(data)).catch(() => setAcademicYears([]));
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", code: "", units: 3, isLab: false, yearLevel: "", curriculumId: "", departmentId: "" });
    setModalOpen(true);
  };

  const openEdit = (s: Subject) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      code: s.code,
      units: s.units,
      isLab: s.isLab,
      yearLevel: s.yearLevel != null ? String(s.yearLevel) : "",
      curriculumId: s.curriculumId ?? "",
      departmentId: s.departmentId ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = form.name.trim();
    if (!nameTrimmed) {
      toast.error("Name is required");
      return;
    }
    if (form.units < 0) {
      toast.error("Units cannot be negative");
      return;
    }
    try {
      // When creating: use custom code if provided, else derive from name. Normalize: spaces→hyphens, alphanumeric+hyphen only, uppercase, max 32 chars.
      const normalizeCode = (raw: string) =>
        raw.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9-]/g, "").toUpperCase().slice(0, 32) || undefined;
      const codeWhenCreating = editingId
        ? undefined
        : (form.code.trim() ? normalizeCode(form.code) : normalizeCode(nameTrimmed)) || `SUB-${Date.now()}`;
      const payload = {
        ...(codeWhenCreating !== undefined && { code: codeWhenCreating }),
        name: nameTrimmed,
        units: form.units,
        isLab: form.isLab,
        yearLevel: form.yearLevel ? Number(form.yearLevel) : null,
        curriculumId: form.curriculumId || null,
        departmentId: form.departmentId || null,
      };
      if (editingId) {
        await apiClient.patch(`/subjects/${editingId}`, payload);
        toast.success("Subject updated");
      } else {
        await apiClient.post("/subjects", { ...payload, code: codeWhenCreating! });
        toast.success("Subject created");
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    }
  };

  const handleDeleteClick = (id: string) => setDeleteConfirmId(id);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/subjects/${deleteConfirmId}`);
      toast.success("Subject moved to trash");
      setDeleteConfirmId(null);
      load();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteLoading(false);
    }
  };

  /** Loads one subject's faculty list for one term (the list is per academic year + semester). */
  const loadPriority = async (s: Subject, term: { academicYearId: string; semester: number }) => {
    setPriorityList([]);
    setPriorityLoading(true);
    try {
      const [priRes, facRes] = await Promise.all([
        apiClient.get<{ facultyId: string; name: string; email: string; priority: number }[]>(
          `/subjects/${s.id}/prioritized-faculty`,
          { params: term }
        ),
        apiClient.get<FacultyWithDepartment[]>("/users?role=FACULTY"),
      ]);
      setPriorityList((priRes.data ?? []).map((p, i) => ({ ...p, priority: i })));
      setAllFaculty(facRes.data ?? []);
    } catch {
      toast.error("Failed to load");
      setPrioritySubject(null);
    } finally {
      setPriorityLoading(false);
    }
  };

  const openPriorityModal = async (s: Subject) => {
    const year = academicYears.find((y) => y.isActive) ?? academicYears[0];
    if (!year) {
      toast.error("No academic year available");
      return;
    }
    const term = { academicYearId: year.id, semester: s.semester ?? 1 };
    setPriorityTerm(term);
    setPrioritySubject(s);
    setAllFaculty([]);
    await loadPriority(s, term);
  };

  const changePriorityTerm = (next: { academicYearId: string; semester: number }) => {
    setPriorityTerm(next);
    if (prioritySubject) void loadPriority(prioritySubject, next);
  };

  const savePriority = async (facultyIds: string[]) => {
    if (!prioritySubject || !priorityTerm) return;
    setPrioritySaving(true);
    try {
      await apiClient.put(`/subjects/${prioritySubject.id}/prioritized-faculty`, { facultyIds, ...priorityTerm });
      toast.success("Prioritized faculty updated");
      setPrioritySubject(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    } finally {
      setPrioritySaving(false);
    }
  };

  const searchLower = searchQuery.trim().toLowerCase();
  const curriculumOptions = (() => {
    const seen = new Map<string, string>();
    for (const s of list) if (s.curriculumId && !seen.has(s.curriculumId)) seen.set(s.curriculumId, s.curriculum?.name ?? "Curriculum");
    const opts = [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    if (list.some((s) => !s.curriculumId)) opts.push({ value: "__none__", label: "No curriculum" });
    return opts;
  })();
  const byCurriculum = curriculumFilter
    ? list.filter((s) => (curriculumFilter === "__none__" ? !s.curriculumId : s.curriculumId === curriculumFilter))
    : list;
  const filteredList = searchLower
    ? byCurriculum.filter(
        (s) =>
          s.code.toLowerCase().includes(searchLower) ||
          s.name.toLowerCase().includes(searchLower) ||
          (s.curriculum?.name ?? "").toLowerCase().includes(searchLower) ||
          (s.department?.name ?? "").toLowerCase().includes(searchLower) ||
          (s.curriculum?.department?.name ?? "").toLowerCase().includes(searchLower)
      )
    : byCurriculum;

  const filteredIds = filteredList.map((s) => s.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...filteredIds]));
    }
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleteLoading(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => apiClient.delete(`/subjects/${id}`)));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      load();
      if (failed === 0) toast.success(`${ok} subject${ok === 1 ? "" : "s"} moved to trash`);
      else if (ok === 0) toast.error("Failed to move to trash");
      else toast.success(`${ok} moved to trash; ${failed} failed`);
    } catch {
      toast.error("Bulk delete failed");
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Subjects</h1>
        {!readOnly && <Button type="button" onClick={openCreate}>Add Subject</Button>}
      </div>
      {list.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Curriculum</label>
          <SearchableSelect
            options={curriculumOptions}
            value={curriculumFilter || "__all__"}
            onValueChange={(v) => setCurriculumFilter(v === "__all__" ? "" : v)}
            noneOption={{ value: "__all__", label: "All curricula" }}
            placeholder="Search curriculum…"
            aria-label="Filter subjects by curriculum"
          />
        </div>
        <div className="relative max-w-md flex-1 basis-64">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" aria-hidden>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </span>
          <input
            type="search"
            placeholder="Search by code, name, curriculum, or department…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-border-strong py-2 pl-9 pr-3 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            aria-label="Search subjects"
          />
        </div>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No subjects yet. Add one to get started.</p>
          {!readOnly && <Button type="button" onClick={openCreate}>Add Subject</Button>}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No subjects match &quot;{searchQuery.trim()}&quot;.</p>
          <button type="button" onClick={() => setSearchQuery("")} className="text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 rounded">
            Clear search
          </button>
        </div>
      ) : (
        <>
          {!readOnly && selectedIds.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded border border-border bg-surface-muted/60 px-3 py-2">
              <span className="text-sm font-medium text-foreground">{selectedIds.size} selected</span>
              <Button type="button" variant="secondary" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </Button>
              <Button type="button" variant="danger" onClick={() => setBulkDeleteOpen(true)}>
                Move selected to trash
              </Button>
            </div>
          )}
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-muted">
              <tr>
                {!readOnly && (<th className="w-10 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && !allFilteredSelected; }}
                    onChange={toggleSelectAll}
                    aria-label="Select all on page"
                    className="rounded border-border-strong focus:ring-focus-ring"
                  />
                </th>)}
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Code</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Department</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Units</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Lab</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Year level</th>
                {!readOnly && (<th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredList.map((s) => (
                <tr key={s.id} className={selectedIds.has(s.id) ? "bg-primary-muted/30" : ""}>
                  {!readOnly && (<td className="w-10 px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleSelect(s.id)}
                      aria-label={`Select ${s.code}`}
                      className="rounded border-border-strong focus:ring-focus-ring"
                    />
                  </td>)}
                  <td className="px-4 py-2 text-foreground">{s.code}</td>
                  <td className="px-4 py-2 text-foreground-muted">{s.name}</td>
                  <td className="px-4 py-2 text-foreground-muted">
                    {s.curriculum?.department?.name ?? s.department?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-foreground-muted">{s.units}</td>
                  <td className="px-4 py-2 text-foreground-muted">{s.isLab ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-foreground-muted">{s.yearLevel ?? "—"}</td>
                  {!readOnly && (<td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                        aria-label={`Edit ${s.code}`}
                        title="Edit"
                      >
                        <Pencil size={20} className="shrink-0" aria-hidden />
                      </button>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button type="button" className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" aria-label={`Actions for ${s.code}`}>
                            <MoreVertical size={20} className="shrink-0" aria-hidden />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="end">
                          <DropdownMenu.Item onSelect={() => openEdit(s)}>Edit</DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={() => openPriorityModal(s)}>Set prioritized faculty</DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={() => handleDeleteClick(s.id)} className="text-danger focus:bg-danger-muted focus:text-danger-hover">Move to trash</DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
                    </div>
                  </td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Content title={editingId ? "Edit Subject" : "Add Subject"}>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {editingId ? (
              <p className="text-sm text-foreground-muted">
                <span className="font-medium text-foreground">Code: </span>
                {list.find((s) => s.id === editingId)?.code ?? "—"}
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
            <input type="number" min={0} placeholder="Units" value={form.units} onChange={(e) => setForm((f) => ({ ...f, units: Number(e.target.value) }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isLab} onChange={(e) => setForm((f) => ({ ...f, isLab: e.target.checked }))} className="rounded border-border-strong focus:ring-focus-ring" />
              <span>Lab subject</span>
            </label>
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
                onValueChange={(v) => setForm((f) => ({ ...f, curriculumId: v === "__none__" ? "" : v }))}
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

      <PrioritizedFacultyModal
        subject={prioritySubject}
        open={prioritySubject !== null}
        onOpenChange={(open) => !open && setPrioritySubject(null)}
        initialPriorityList={priorityList}
        allFaculty={allFaculty}
        onSave={savePriority}
        saving={prioritySaving}
        loading={priorityLoading}
        termControls={
          priorityTerm && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="pf-ay" className="mb-1 block text-xs font-medium text-foreground-muted">Academic year</label>
                <select
                  id="pf-ay"
                  value={priorityTerm.academicYearId}
                  onChange={(e) => changePriorityTerm({ ...priorityTerm, academicYearId: e.target.value })}
                  disabled={priorityLoading || prioritySaving}
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
                  value={priorityTerm.semester}
                  onChange={(e) => changePriorityTerm({ ...priorityTerm, semester: Number(e.target.value) })}
                  disabled={priorityLoading || prioritySaving}
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
        termLabel={
          priorityTerm
            ? `${academicYears.find((y) => y.id === priorityTerm.academicYearId)?.name ?? ""} · ${["", "1st Sem", "2nd Sem", "Mid Year"][priorityTerm.semester]}`
            : undefined
        }
      />

      <Dialog.Root open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <Dialog.Content title="Move subject to trash" description="This subject will be moved to Trash. An admin can restore it or permanently delete it from the Trash page.">
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button type="button" variant="danger" onClick={handleDeleteConfirm} disabled={deleteLoading}>
              {deleteLoading ? "…" : "Move to trash"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <Dialog.Content title="Move selected to trash" description={`${selectedIds.size} subject${selectedIds.size === 1 ? "" : "s"} will be moved to Trash. You can restore them from the Trash page.`}>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button type="button" variant="danger" onClick={handleBulkDeleteConfirm} disabled={bulkDeleteLoading}>
              {bulkDeleteLoading ? "…" : "Move to trash"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
