import { useEffect, useState, useCallback } from "react";
import { currentTerm } from "../../utils/currentTerm";
import { apiClient } from "../../api/apiClient";
import type { AcademicYear, UserListItem } from "../../types/api";
import type { Subject } from "../../types/api";
import toast from "react-hot-toast";
import { ClipboardList, MoreVertical, Pencil, SlidersHorizontal } from "lucide-react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { HelpTip } from "../../components/ui/helpTip";
import { DeloadingDialog } from "../../components/faculty/DeloadingDialog";
import { LOAD_STATE_BADGE, LOAD_STATE_LABEL, effectiveMax, loadStateOf, ROLE_LABEL } from "../../utils/loadState";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";
import { SearchableSelect } from "../../components/ui/searchableSelect";
import { Select } from "../../components/ui/select";
import { useAppSelector } from "../../store/hooks";
import { UserFormDialog, EMPTY_USER_FORM, type UserFormValues, type UserFormPayload } from "../../components/users/UserFormDialog";

/** Subject row from GET /users/:id/prioritized-subjects (possible subjects to teach). */
interface PrioritizedSubjectItem {
  subjectId: string;
  priority: number;
  code: string;
  name: string;
  units: number;
  isLab: boolean;
}

/** Department faculty, including the chairman (who also carries a teaching load). Scoped to the chairman's department by the backend. */
export function ChairmanFacultyPage() {
  const [list, setList] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const user = useAppSelector((s) => s.auth.user);
  const [ownDepartment, setOwnDepartment] = useState<{ id: string; name: string } | null>(null);
  const [facultyForm, setFacultyForm] = useState<{ id: string | null; initial: UserFormValues } | null>(null);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [unitsByFaculty, setUnitsByFaculty] = useState<Record<string, number>>({});
  /** Deloading per person for the selected term (units deducted from the maximum). */
  const [deloadByUser, setDeloadByUser] = useState<Record<string, { total: number; items: { description: string; units: number }[] }>>({});
  const [deloadTarget, setDeloadTarget] = useState<UserListItem | null>(null);
  const [copyDeloading, setCopyDeloading] = useState(true);

  const [possibleSubjectsUser, setPossibleSubjectsUser] = useState<UserListItem | null>(null);
  const [possibleSubjectsList, setPossibleSubjectsList] = useState<PrioritizedSubjectItem[]>([]);
  const [possibleSubjectsLoading, setPossibleSubjectsLoading] = useState(false);
  const [subjectsPool, setSubjectsPool] = useState<Subject[]>([]);
  const [addSubjectId, setAddSubjectId] = useState<string>("");
  const [addCurriculumId, setAddCurriculumId] = useState<string>("");
  /** Term the open "possible subjects" dialog edits (fixed when it opens, so a mid-edit term change cannot mix terms). */
  const [possibleTerm, setPossibleTerm] = useState<{ academicYearId: string; semester: number } | null>(null);
  /** "term" = only subjects offered this semester (or any); "all" = every subject of the department. */
  const [subjectScope, setSubjectScope] = useState<"term" | "all">("term");
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyFromYearId, setCopyFromYearId] = useState("");
  const [copyFromSemester, setCopyFromSemester] = useState(1);
  const [copying, setCopying] = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<UserListItem[]>("/users", {
        params: { role: ["FACULTY", "CHAIRMAN", "DEAN", "COLLEGE_SECRETARY"] },
      });
      setList(data);
    } catch {
      toast.error("Failed to load faculty");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiClient
      .get<{ id: string; name: string }[]>("/departments")
      .then(({ data }) => setOwnDepartment(data.find((d) => d.id === user?.departmentId) ?? null))
      .catch(() => setOwnDepartment(null));
  }, [user?.departmentId]);

  useEffect(() => {
    apiClient
      .get<AcademicYear[]>("/academic-years/for-schedules")
      .then(({ data }) => {
        setAcademicYears(data);
        const term = currentTerm(data);
        setAcademicYearId(term?.academicYearId ?? "");
        if (term) setSemester(term.semester);
      })
      .catch(() => setAcademicYears([]));
  }, []);

  const loadUnits = useCallback(async () => {
    if (!academicYearId) {
      setUnitsByFaculty({});
      setDeloadByUser({});
      return;
    }
    try {
      const params = new URLSearchParams({ academicYearId, semester: String(semester) });
      const [units, deload] = await Promise.all([
        apiClient.get<Record<string, number>>(`/faculty-loads/units?${params}`),
        apiClient.get<{ userId: string; total: number; items: { description: string; units: number }[] }[]>(`/deloadings?${params}`),
      ]);
      setUnitsByFaculty(units.data ?? {});
      setDeloadByUser(Object.fromEntries((deload.data ?? []).map((d) => [d.userId, { total: d.total, items: d.items }])));
    } catch {
      setUnitsByFaculty({});
      setDeloadByUser({});
    }
  }, [academicYearId, semester]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const renderUnits = (u: UserListItem) => {
    const loaded = Math.round((unitsByFaculty[u.id] ?? 0) * 100) / 100;
    const deload = deloadByUser[u.id]?.total ?? 0;
    const effective = effectiveMax(u.maxUnits, deload);
    const state = loadStateOf(loaded, effective);
    const detail =
      effective === null
        ? `${loaded} units assigned. No maximum set, so overload and underload cannot be judged.`
        : `${loaded} units assigned of ${effective} allowed (maximum ${u.maxUnits}${deload > 0 ? ` less ${deload} deloading` : ""}). ${LOAD_STATE_LABEL[state]}.`;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-sm tabular-nums ${LOAD_STATE_BADGE[state]}`} title={detail}>
        {loaded}/{effective ?? "—"}
        {state !== "unset" && <span className="text-xs font-medium">{LOAD_STATE_LABEL[state]}</span>}
        {deload > 0 && <span className="text-xs opacity-80">(−{deload})</span>}
      </span>
    );
  };

  const openAdd = () =>
    setFacultyForm({ id: null, initial: { ...EMPTY_USER_FORM, role: "FACULTY", departmentId: user?.departmentId ?? "" } });

  const openEdit = (u: UserListItem) =>
    setFacultyForm({
      id: u.id,
      initial: {
        name: u.name,
        email: u.email,
        password: "",
        role: u.role,
        departmentId: u.departmentId ?? "",
        status: u.status ?? "",
        maxUnits: u.maxUnits != null ? String(u.maxUnits) : "",
      },
    });

  const submitFacultyForm = async (payload: UserFormPayload) => {
    if (facultyForm?.id) {
      await apiClient.patch(`/users/${facultyForm.id}`, { status: payload.status, maxUnits: payload.maxUnits });
      toast.success("Faculty updated");
    } else {
      await apiClient.post("/users", { ...payload, role: "FACULTY", departmentId: user?.departmentId ?? null });
      toast.success("Faculty added");
    }
    load();
    loadUnits();
  };

  const termLabel = (ayId: string, sem: number) => {
    const name = academicYears.find((y) => y.id === ayId)?.name ?? "";
    return `${name} · ${sem === 1 ? "1st Sem" : sem === 2 ? "2nd Sem" : "Mid Year"}`;
  };

  const openPossibleSubjects = async (u: UserListItem) => {
    if (!academicYearId) {
      toast.error("Select an academic year first");
      return;
    }
    const term = { academicYearId, semester };
    setPossibleTerm(term);
    setSubjectScope("term");
    setPossibleSubjectsUser(u);
    setPossibleSubjectsList([]);
    setAddSubjectId("");
    setAddCurriculumId("");
    setPossibleSubjectsLoading(true);
    try {
      const [subjectsRes, prioritizedRes] = await Promise.all([
        apiClient.get<Subject[]>("/subjects"),
        apiClient.get<PrioritizedSubjectItem[]>(`/users/${u.id}/prioritized-subjects`, { params: term }),
      ]);
      setSubjectsPool(subjectsRes.data ?? []);
      setPossibleSubjectsList(prioritizedRes.data ?? []);
    } catch {
      toast.error("Failed to load data");
      setPossibleSubjectsUser(null);
    } finally {
      setPossibleSubjectsLoading(false);
    }
  };

  const addPossibleSubject = async () => {
    if (!possibleSubjectsUser || !addSubjectId || !possibleTerm) return;
    setSavingSubject(true);
    try {
      const { data: current } = await apiClient.get<{ facultyId: string; name: string; email: string; priority: number }[]>(
        `/subjects/${addSubjectId}/prioritized-faculty`,
        { params: possibleTerm }
      );
      const currentIds = (current ?? []).map((p) => p.facultyId);
      if (currentIds.includes(possibleSubjectsUser.id)) {
        toast("Faculty is already in the list for this subject.");
        setSavingSubject(false);
        return;
      }
      await apiClient.put(`/subjects/${addSubjectId}/prioritized-faculty`, {
        facultyIds: [...currentIds, possibleSubjectsUser.id],
        ...possibleTerm,
      });
      const subject = subjectsPool.find((s) => s.id === addSubjectId);
      setPossibleSubjectsList((prev) => [
        ...prev,
        {
          subjectId: addSubjectId,
          priority: prev.length,
          code: subject?.code ?? "",
          name: subject?.name ?? "",
          units: subject?.units ?? 0,
          isLab: subject?.isLab ?? false,
        },
      ]);
      setAddSubjectId("");
      toast.success("Subject added");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to add subject";
      toast.error(msg);
    } finally {
      setSavingSubject(false);
    }
  };

  const removePossibleSubject = async (subjectId: string) => {
    if (!possibleSubjectsUser || !possibleTerm) return;
    setSavingSubject(true);
    try {
      const { data: current } = await apiClient.get<{ facultyId: string }[]>(
        `/subjects/${subjectId}/prioritized-faculty`,
        { params: possibleTerm }
      );
      const nextIds = (current ?? []).map((p) => p.facultyId).filter((id) => id !== possibleSubjectsUser.id);
      await apiClient.put(`/subjects/${subjectId}/prioritized-faculty`, { facultyIds: nextIds, ...possibleTerm });
      setPossibleSubjectsList((prev) => prev.filter((p) => p.subjectId !== subjectId));
      toast.success("Subject removed");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to remove subject";
      toast.error(msg);
    } finally {
      setSavingSubject(false);
    }
  };

  const openCopy = () => {
    const other = academicYears.find((y) => y.id !== academicYearId) ?? academicYears[0];
    setCopyFromYearId(other?.id ?? "");
    setCopyFromSemester(semester === 1 ? 2 : 1);
    setCopyOpen(true);
  };

  const copyFromTerm = async () => {
    if (!academicYearId || !copyFromYearId) return;
    setCopying(true);
    try {
      const { data } = await apiClient.post<{ found: number; copied: number; skipped: number }>(
        "/subjects/prioritized-faculty/copy",
        {
          fromAcademicYearId: copyFromYearId,
          fromSemester: copyFromSemester,
          toAcademicYearId: academicYearId,
          toSemester: semester,
          facultyIds: list.map((u) => u.id),
        }
      );
      if (copyDeloading) {
        try {
          await apiClient.post("/deloadings/copy", {
            fromAcademicYearId: copyFromYearId,
            fromSemester: copyFromSemester,
            toAcademicYearId: academicYearId,
            toSemester: semester,
            userIds: list.map((u) => u.id),
          });
          loadUnits();
        } catch {
          toast.error("Possible subjects were copied, but the deloading could not be.");
        }
      }
      toast.success(
        data.found === 0
          ? "Nothing to copy from that term."
          : `Copied ${data.copied} possible subject${data.copied === 1 ? "" : "s"}${data.skipped ? ` (${data.skipped} already there)` : ""}.`
      );
      setCopyOpen(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Copy failed";
      toast.error(msg);
    } finally {
      setCopying(false);
    }
  };

  /** Subjects offered in the term's semester (a subject with no semester is offered in every semester). */
  const poolForScope = subjectsPool.filter(
    (sub) => subjectScope === "all" || sub.semester == null || sub.semester === (possibleTerm?.semester ?? semester)
  );

  const curriculumOptions = (() => {
    const seen = new Map<string, string>();
    for (const sub of poolForScope) {
      if (sub.curriculumId && !seen.has(sub.curriculumId)) seen.set(sub.curriculumId, sub.curriculum?.name ?? "Curriculum");
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  })();
  const subjectOptions = poolForScope
    .filter((s) => !possibleSubjectsList.some((p) => p.subjectId === s.id))
    .filter((s) => !addCurriculumId || s.curriculumId === addCurriculumId);

  const filteredList = searchQuery.trim()
    ? list.filter(
        (u) =>
          u.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          (u.email && u.email.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      )
    : list;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
<h1 className="text-2xl font-semibold text-foreground">
          Faculty</h1>
<HelpTip>Faculty of your department, including the chairman. Possible subjects define which subjects auto-assign may give each person in the selected term; a subject is only assigned to faculty listed for it.</HelpTip>
</div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={openCopy} disabled={!academicYearId || academicYears.length < 1}>
            Copy possible subjects from another term
          </Button>
          <Button type="button" onClick={openAdd}>Add Faculty</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Academic year</label>
          <SearchableSelect
            options={academicYears.map((y) => ({ value: y.id, label: y.isActive ? `${y.name} (current)` : y.name }))}
            value={academicYearId || "__none__"}
            onValueChange={(v) => setAcademicYearId(v === "__none__" ? "" : v)}
            noneOption={{ value: "__none__", label: "Academic year" }}
            placeholder="Search academic year…"
            aria-label="Academic year"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Semester</label>
          <Select.Root value={String(semester)} onValueChange={(v) => setSemester(Number(v))}>
            <Select.Trigger aria-label="Semester" className="w-[120px]">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="1">1st Sem</Select.Item>
              <Select.Item value="2">2nd Sem</Select.Item>
              <Select.Item value="3">Mid Year</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
        <div className="pb-2">
          <HelpTip>Assigned units against the maximum for the selected term. Laboratory units count three times.</HelpTip>
        </div>
      </div>

      {list.length > 0 && (
        <div className="mb-4">
          <label className="sr-only" htmlFor="faculty-search">Search faculty</label>
          <input
            id="faculty-search"
            type="search"
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-xs rounded border border-border-strong px-3 py-2 text-sm focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            aria-label="Search faculty"
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted">No faculty in your department.</p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted">No faculty match &quot;{searchQuery.trim()}&quot;.</p>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="mt-2 text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 rounded"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Email</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Status</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Units</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredList.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-foreground">
                    {u.name}
                    {(u.role === "DEAN" || u.role === "COLLEGE_SECRETARY") && (
                      <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-foreground-muted">{ROLE_LABEL[u.role]}</span>
                    )}
                    {u.role === "CHAIRMAN" && (
                      <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-foreground-muted">
                        Chairman{u.id === user?.id ? " (you)" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-foreground-muted">{u.email}</td>
                  <td className="px-4 py-2 text-foreground-muted">{u.status ?? "—"}</td>
                  <td className="px-4 py-2">{renderUnits(u)}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                        aria-label={`Edit ${u.name}`}
                        title="Edit status and max units"
                      >
                        <Pencil size={20} className="shrink-0" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeloadTarget(u)}
                        className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                        aria-label={`Deloading for ${u.name}`}
                        title="Deloading: units deducted from the maximum"
                      >
                        <SlidersHorizontal size={20} className="shrink-0" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => openPossibleSubjects(u)}
                        className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                        aria-label={`Manage possible subjects for ${u.name}`}
                        title="Manage possible subjects to teach"
                      >
                        <ClipboardList size={20} className="shrink-0" aria-hidden />
                      </button>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                            aria-label={`Actions for ${u.name}`}
                          >
                            <MoreVertical size={20} className="shrink-0" aria-hidden />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="end">
                          <DropdownMenu.Item onSelect={() => openEdit(u)}>
                            Edit
                          </DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={() => setDeloadTarget(u)}>
                            Deloading
                          </DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={() => openPossibleSubjects(u)}>
                            Manage possible subjects to teach
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog.Root
        open={possibleSubjectsUser !== null}
        onOpenChange={(open) => !open && setPossibleSubjectsUser(null)}
      >
        <Dialog.Content
          className="!max-w-2xl"
          title={`Possible subjects to teach — ${possibleSubjectsUser?.name ?? ""}`}
          description={`Subjects this faculty can be assigned to in auto-assign for ${possibleTerm ? termLabel(possibleTerm.academicYearId, possibleTerm.semester) : "this term"} only. Other terms are not changed.`}
        >
          <div className="mt-4 space-y-4">
            {possibleSubjectsLoading ? (
              <div className="flex justify-center py-8" aria-busy="true">
                <Spinner />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 basis-44">
                    <label htmlFor="ps-scope" className="mb-1 block text-sm font-medium text-foreground">Offered</label>
                    <select
                      id="ps-scope"
                      value={subjectScope}
                      onChange={(e) => {
                        setSubjectScope(e.target.value as "term" | "all");
                        setAddSubjectId("");
                      }}
                      disabled={savingSubject}
                      className="w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                    >
                      <option value="term">This semester</option>
                      <option value="all">All semesters</option>
                    </select>
                  </div>
                  <div className="min-w-0 basis-52">
                    <label htmlFor="ps-curriculum" className="mb-1 block text-sm font-medium text-foreground">Curriculum</label>
                    <select
                      id="ps-curriculum"
                      value={addCurriculumId}
                      onChange={(e) => {
                        setAddCurriculumId(e.target.value);
                        setAddSubjectId("");
                      }}
                      disabled={savingSubject}
                      className="w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                    >
                      <option value="">All curricula</option>
                      {curriculumOptions.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0 flex-1 basis-48">
                    <label className="mb-1 block text-sm font-medium text-foreground">Add subject</label>
                    <SearchableSelect
                      options={subjectOptions.map((s) => ({
                        value: s.id,
                        label: `${s.code} — ${s.name}${!addCurriculumId && s.curriculum?.name ? ` (${s.curriculum.name})` : ""}`,
                      }))}
                      value={addSubjectId || "__none__"}
                      onValueChange={(v) => setAddSubjectId(v === "__none__" ? "" : v)}
                      placeholder="Search subject…"
                      noneOption={{ value: "__none__", label: "Select subject…" }}
                      disabled={savingSubject}
                      aria-label="Choose subject to add"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={addPossibleSubject}
                    disabled={!addSubjectId || savingSubject}
                  >
                    {savingSubject ? "…" : "Add"}
                  </Button>
                </div>

                {possibleSubjectsList.length === 0 ? (
                  <p className="py-4 text-center text-foreground-muted">
                    No possible subjects set. Add subjects above so auto-assign can consider this faculty for those subjects.
                  </p>
                ) : (
                  <div className="rounded border border-border overflow-hidden">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-surface-muted">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-foreground">#</th>
                          <th className="px-3 py-2 text-left font-medium text-foreground">Code</th>
                          <th className="px-3 py-2 text-left font-medium text-foreground">Subject</th>
                          <th className="px-3 py-2 text-left font-medium text-foreground">Units</th>
                          <th className="px-3 py-2 text-left font-medium text-foreground">Lab</th>
                          <th className="px-3 py-2 text-right font-medium text-foreground">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {possibleSubjectsList.map((row, idx) => (
                          <tr key={row.subjectId}>
                            <td className="px-3 py-2 text-foreground-muted">{idx + 1}</td>
                            <td className="px-3 py-2 text-foreground">{row.code}</td>
                            <td className="px-3 py-2 text-foreground">{row.name}</td>
                            <td className="px-3 py-2 text-foreground-muted">{row.units}</td>
                            <td className="px-3 py-2 text-foreground-muted">{row.isLab ? "Yes" : "—"}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removePossibleSubject(row.subjectId)}
                                disabled={savingSubject}
                                className="rounded p-1 text-foreground-muted hover:bg-danger-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-focus-ring disabled:opacity-50"
                                aria-label={`Remove ${row.code} from possible subjects`}
                              >
                                <span className="text-xs font-medium">Remove</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          
          </div>
        </Dialog.Content>
      </Dialog.Root>
      <Dialog.Root open={copyOpen} onOpenChange={setCopyOpen}>
        <Dialog.Content
          title="Copy possible subjects"
          description={`Copy your department's possible subjects into ${termLabel(academicYearId, semester)}. Subjects already set there are kept, and the source term is not changed.`}
        >
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="copy-ay" className="mb-1 block text-sm font-medium text-foreground">From academic year</label>
              <select
                id="copy-ay"
                value={copyFromYearId}
                onChange={(e) => setCopyFromYearId(e.target.value)}
                className="w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              >
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="copy-sem" className="mb-1 block text-sm font-medium text-foreground">From semester</label>
              <select
                id="copy-sem"
                value={copyFromSemester}
                onChange={(e) => setCopyFromSemester(Number(e.target.value))}
                className="w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              >
                <option value={1}>1st Sem</option>
                <option value={2}>2nd Sem</option>
                <option value={3}>Mid Year</option>
              </select>
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={copyDeloading}
              onChange={(e) => setCopyDeloading(e.target.checked)}
              className="rounded border-border-strong focus:ring-focus-ring"
            />
            Also copy deloading (only for people who have none in this term)
          </label>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button type="button" onClick={copyFromTerm} disabled={copying || !copyFromYearId}>
              {copying ? "Copying…" : "Copy"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
      {deloadTarget && (
        <DeloadingDialog
          person={{ id: deloadTarget.id, name: deloadTarget.name, maxUnits: deloadTarget.maxUnits }}
          years={academicYears}
          academicYearId={academicYearId}
          semester={semester}
          canEdit
          onClose={() => setDeloadTarget(null)}
          onSaved={loadUnits}
        />
      )}
      {facultyForm && (
        <UserFormDialog
          mode={facultyForm.id ? "edit" : "create"}
          title={facultyForm.id ? (facultyForm.initial.role === "CHAIRMAN" ? "Edit chairman load limits" : "Edit faculty") : "Add faculty"}
          initial={facultyForm.initial}
          departments={ownDepartment ? [ownDepartment] : []}
          allowedRoles={[facultyForm.initial.role]}
          lockDepartment
          lockIdentity={Boolean(facultyForm.id)}
          onClose={() => setFacultyForm(null)}
          onSubmit={submitFacultyForm}
        />
      )}
    </div>
  );
}
