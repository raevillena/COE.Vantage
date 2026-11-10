import { useEffect, useRef, useState } from "react";
import { FilterSelect } from "../../components/ui/listFilters";
import { Pager } from "../../components/ui/pager";
import { apiClient } from "../../api/apiClient";
import type { Subject } from "../../types/api";
import toast from "react-hot-toast";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { SearchableSelect } from "../../components/ui/searchableSelect";
import { MoreVertical, Pencil } from "lucide-react";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";
import { useAppSelector } from "../../store/hooks";
import { unitsLabel, weeklyHours } from "../../utils/subjectUnits";
import { HistoryButton } from "../../components/audit/HistoryButton";
import { SubjectFormDialog } from "../../components/subjects/SubjectFormDialog";
import { SubjectRoomsDialog } from "../../components/subjects/SubjectRoomsDialog";
import { SubjectFacultyDialog } from "../../components/subjects/SubjectFacultyDialog";

export function SubjectsPage() {
  /** The college secretary can view everything the dean can but never change it. */
  const role = useAppSelector((st) => st.auth.user?.role);
  const readOnly = role === "COLLEGE_SECRETARY" || role === "PRESIDENT" || role === "UNIT";
  /** The current page of subjects; search and filters run on the server over ALL subjects. */
  const [list, setList] = useState<Subject[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [curriculaLoaded, setCurriculaLoaded] = useState(false);
  /** "" = all curricula, "__none__" = subjects without a curriculum, otherwise a curriculum id. */
  const [curriculumFilter, setCurriculumFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const loadSeqRef = useRef(0);
  /** The subject form: null = closed, subject null = adding one. */
  const [formState, setFormState] = useState<{ subject: Subject | null } | null>(null);
  const [curricula, setCurricula] = useState<{ id: string; name: string; createdAt?: string; departmentId?: string | null }[]>([]);
  /** Possible rooms and faculty: the subject being set. */
  const [roomsSubject, setRoomsSubject] = useState<Subject | null>(null);
  const [prioritySubject, setPrioritySubject] = useState<Subject | null>(null);
  const [filterInitialized, setFilterInitialized] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [filterKind, setFilterKind] = useState("");

  /** Everything the server needs to pick the page: filters and search apply to all subjects, not just the visible page. */
  const query = () => ({
    page,
    pageSize,
    ...(debouncedQuery ? { q: debouncedQuery } : {}),
    ...(curriculumFilter ? { curriculumId: curriculumFilter } : {}),
    ...(filterDepartment ? { departmentId: filterDepartment } : {}),
    ...(filterYear ? { yearLevel: filterYear } : {}),
    ...(filterSemester ? { semester: filterSemester } : {}),
    ...(filterKind ? { kind: filterKind } : {}),
  });
  const load = async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const { data } = await apiClient.get<{ items: Subject[]; total: number; totalAll: number; page: number }>("/subjects", { params: query() });
      if (seq !== loadSeqRef.current) return; // a newer search already replaced this one
      setList(data.items);
      setTotal(data.total);
      setTotalAll(data.totalAll);
      if (data.page !== page) setPage(data.page);
    } catch {
      if (seq === loadSeqRef.current) toast.error("Failed to load subjects");
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    apiClient.get("/curriculum").then(({ data }) => setCurricula(data)).finally(() => setCurriculaLoaded(true));
    apiClient.get<{ id: string; name: string }[]>("/departments").then(({ data }) => setDepartments(data)).catch(() => setDepartments([]));
  }, []);

  // the search waits for a pause in typing
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  // load the page whenever the page, its size, the search or a filter changes (after the curriculum filter has its starting value)
  const ready = curriculaLoaded && (filterInitialized || curricula.length === 0);
  useEffect(() => {
    if (ready) void load();
  }, [ready, page, pageSize, debouncedQuery, curriculumFilter, filterDepartment, filterYear, filterSemester, filterKind]);

  // Start on the most recently added curriculum instead of "All curricula".
  useEffect(() => {
    if (filterInitialized || curricula.length === 0) return;
    const latest = [...curricula].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
    setCurriculumFilter(latest.id);
    setFilterInitialized(true);
  }, [curricula, filterInitialized]);

  const openCreate = () => setFormState({ subject: null });
  const openEdit = (s: Subject) => setFormState({ subject: s });

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

  const curriculumOptions = (() => {
    const opts = curricula.map((c) => ({ value: c.id, label: c.name })).sort((a, b) => a.label.localeCompare(b.label));
    opts.push({ value: "__none__", label: "No curriculum" });
    return opts;
  })();
  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name })).sort((a, b) => a.label.localeCompare(b.label));
  const yearOptions = [1, 2, 3, 4, 5].map((y) => ({ value: String(y), label: `Year ${y}` }));
  const filtersActive = Boolean(searchQuery.trim() || filterDepartment || filterYear || filterSemester || filterKind);
  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedQuery("");
    setFilterDepartment("");
    setFilterYear("");
    setFilterSemester("");
    setFilterKind("");
    setPage(1);
  };
  /** Changing a filter always goes back to the first page. */
  const withReset = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };
  const filteredList = list;

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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Subjects</h1>
          <HistoryButton entityType="SUBJECT" title="Subjects" />
        </div>
        {!readOnly && <Button type="button" onClick={openCreate}>Add Subject</Button>}
      </div>
      {(totalAll > 0 || filtersActive || curriculumFilter) && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Curriculum</label>
          <SearchableSelect
            options={curriculumOptions}
            value={curriculumFilter || "__all__"}
            onValueChange={(v) => { setCurriculumFilter(v === "__all__" ? "" : v); setPage(1); }}
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
        {departmentOptions.length > 1 && (
          <FilterSelect label="Filter by department" value={filterDepartment} onChange={withReset(setFilterDepartment)} options={[...departmentOptions, { value: "__none__", label: "No department" }]} allLabel="All departments" />
        )}
        {(totalAll > 0 || yearOptions.length > 0) && (
          <FilterSelect label="Filter by year level" value={filterYear} onChange={withReset(setFilterYear)} options={[...yearOptions, { value: "__none__", label: "No year level" }]} allLabel="All year levels" />
        )}
        <FilterSelect
          label="Filter by semester"
          value={filterSemester}
          onChange={withReset(setFilterSemester)}
          options={[{ value: "1", label: "1st Sem" }, { value: "2", label: "2nd Sem" }, { value: "3", label: "Mid Year" }, { value: "__none__", label: "Any semester (not set)" }]}
          allLabel="All semesters"
        />
        <FilterSelect label="Filter by type" value={filterKind} onChange={withReset(setFilterKind)} options={[{ value: "lecture", label: "Lecture only" }, { value: "lab", label: "With laboratory" }]} allLabel="Lecture and lab" />
        {filtersActive && (
          <button type="button" onClick={clearFilters} className="rounded text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1">
            Clear filters
          </button>
        )}
        <span className="text-sm text-foreground-muted" aria-live="polite">{total} matching of {totalAll} subjects</span>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : totalAll === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No subjects yet. Add one to get started.</p>
          {!readOnly && <Button type="button" onClick={openCreate}>Add Subject</Button>}
        </div>
      ) : total === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No subjects match{searchQuery.trim() ? ` "${searchQuery.trim()}"` : " these filters"}.</p>
          <button type="button" onClick={clearFilters} className="text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 rounded">
            Clear search and filters
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
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Hrs/week</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Year level</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Rooms</th>
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
                  <td className="px-4 py-2 text-foreground-muted">{unitsLabel(s)}</td>
                  <td className="px-4 py-2 text-foreground-muted">{weeklyHours(s)}</td>
                  <td className="px-4 py-2 text-foreground-muted">{s.yearLevel ?? "—"}</td>
                  <td
                    className="px-4 py-2 text-foreground-muted"
                    title={(s.subjectRooms ?? []).map((r) => r.room.name).join(", ") || "Auto-assign may use any available room"}
                  >
                    {(s.subjectRooms ?? []).length === 0
                      ? "Any"
                      : (s.subjectRooms ?? []).length <= 2
                        ? (s.subjectRooms ?? []).map((r) => r.room.name).join(", ")
                        : `${(s.subjectRooms ?? []).length} rooms`}
                  </td>
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
                          <DropdownMenu.Item onSelect={() => setPrioritySubject(s)}>Set prioritized faculty</DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={() => setRoomsSubject(s)}>Set rooms for auto-assign</DropdownMenu.Item>
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
        <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} busy={loading} />
        </>
      )}
      <SubjectFormDialog
        open={formState !== null}
        subject={formState?.subject ?? null}
        defaultCurriculumId={curriculumFilter && curriculumFilter !== "__none__" ? curriculumFilter : undefined}
        onClose={() => setFormState(null)}
        onSaved={({ created, curriculumId }) => {
          // show it: the list is filtered by curriculum, and a subject in another one would seem to vanish
          if (created && curriculumFilter) setCurriculumFilter(curriculumId || "__none__");
          load();
        }}
      />
      <SubjectRoomsDialog subject={roomsSubject} onClose={() => setRoomsSubject(null)} onSaved={load} />
      <SubjectFacultyDialog subject={prioritySubject} onClose={() => setPrioritySubject(null)} />

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
