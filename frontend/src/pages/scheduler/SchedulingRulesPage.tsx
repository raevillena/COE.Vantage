import type { FC } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../api/apiClient";
import type {
  SchedulingRuleSet,
  SchedulingRuleSetAssignment,
  SchedulingRuleSetConfig,
  AcademicYear,
  StudentClass,
} from "../../types/api";
import { getApiErrorMessage } from "../../types/api";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { Select } from "../../components/ui/select";
import { Dialog } from "../../components/ui/dialog";
import { useAppSelector } from "../../store/hooks";
import { Edit3, Trash2 } from "lucide-react";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Minutes from midnight → "HH:mm" for time inputs. */
function minutesToTimeString(minutes: number): string {
  const h = Math.floor(Math.max(0, Math.min(24 * 60, minutes)) / 60) % 24;
  const m = Math.max(0, Math.min(59, Math.floor(minutes % 60)));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:mm" or "H:mm" → minutes from midnight. */
function timeStringToMinutes(s: string): number {
  const trimmed = (s || "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return 0;
  const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return h * 60 + m;
}

const DEFAULT_CONFIG: SchedulingRuleSetConfig = {
  workStartMinutes: 8 * 60,
  workEndMinutes: 17 * 60,
  lunchStartMinutes: 12 * 60,
  lunchEndMinutes: 13 * 60,
  slotStepMinutes: 15,
  avoidLunchSpan: true,
  preferMwfFor3UnitLecture: true,
  preferTthFor3UnitLecture: false,
  requireLabBreakAfterLongLab: true,
  maxBlockMinutes: 300,
  excludedDays: [5], // default: avoid Friday
};

export interface SchedulingRulesPageProps {
  /** Link target for back button (e.g. "/scheduler" or "/dashboard"). */
  backTo?: string;
  /** Page title. */
  title?: string;
  /** When true, show admin-focused copy (add rules for everyone). */
  isAdminPage?: boolean;
}

export const SchedulingRulesPage: FC<SchedulingRulesPageProps> = (props) => {
  const { backTo = "/scheduler", title = "Scheduling rule sets", isAdminPage = false } = props;
  const user = useAppSelector((s) => s.auth.user);
  const isAdmin = user?.role === "ADMIN";
  const [ruleSets, setRuleSets] = useState<SchedulingRuleSet[]>([]);
  const [assignments, setAssignments] = useState<SchedulingRuleSetAssignment[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [studentClasses, setStudentClasses] = useState<StudentClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignAcademicYearId, setAssignAcademicYearId] = useState<string>("");
  const [assignStudentClassId, setAssignStudentClassId] = useState<string>("");
  const [assignRuleSetId, setAssignRuleSetId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<SchedulingRuleSet | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formConfig, setFormConfig] = useState<SchedulingRuleSetConfig>({ ...DEFAULT_CONFIG });
  const [saving, setSaving] = useState(false);

  type ThreeUnitPatternMode = "none" | "mwf" | "tth" | "random3";
  const threeUnitPatternMode: ThreeUnitPatternMode =
    formConfig.preferMwfFor3UnitLecture && !formConfig.preferTthFor3UnitLecture && !formConfig.preferRandom3DayFor3UnitLecture
      ? "mwf"
      : !formConfig.preferMwfFor3UnitLecture && formConfig.preferTthFor3UnitLecture && !formConfig.preferRandom3DayFor3UnitLecture
      ? "tth"
      : formConfig.preferRandom3DayFor3UnitLecture
      ? "random3"
      : "none";

  const setThreeUnitPatternMode = (mode: ThreeUnitPatternMode) => {
    if (mode === "none") {
      setFormConfig((c) => ({
        ...c,
        preferMwfFor3UnitLecture: false,
        preferTthFor3UnitLecture: false,
        preferRandom3DayFor3UnitLecture: false,
      }));
    } else if (mode === "mwf") {
      setFormConfig((c) => ({
        ...c,
        preferMwfFor3UnitLecture: true,
        preferTthFor3UnitLecture: false,
        preferRandom3DayFor3UnitLecture: false,
      }));
    } else if (mode === "tth") {
      setFormConfig((c) => ({
        ...c,
        preferMwfFor3UnitLecture: false,
        preferTthFor3UnitLecture: true,
        preferRandom3DayFor3UnitLecture: false,
      }));
    } else {
      setFormConfig((c) => ({
        ...c,
        preferMwfFor3UnitLecture: false,
        preferTthFor3UnitLecture: false,
        preferRandom3DayFor3UnitLecture: true,
      }));
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [setsRes, assignRes, yearsRes, classesRes] = await Promise.all([
        apiClient.get<SchedulingRuleSet[]>("/scheduling-rule-sets"),
        apiClient.get<SchedulingRuleSetAssignment[]>("/scheduling-rule-sets/assignments"),
        apiClient.get<AcademicYear[]>("/academic-years/for-schedules"),
        apiClient.get<StudentClass[]>("/student-classes"),
      ]);
      setRuleSets(setsRes.data);
      setAssignments(assignRes.data);
      setAcademicYears(yearsRes.data);
      setStudentClasses(classesRes.data);
    } catch {
      toast.error("Failed to load scheduling rules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSetAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignRuleSetId) {
      toast.error("Select a rule set");
      return;
    }
    setAssigning(true);
    try {
      await apiClient.post("/scheduling-rule-sets/assignments", {
        academicYearId: assignAcademicYearId || null,
        studentClassId: assignStudentClassId || null,
        ruleSetId: assignRuleSetId,
      });
      toast.success("Assignment saved");
      setAssignAcademicYearId("");
      setAssignStudentClassId("");
      setAssignRuleSetId("");
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to set assignment"));
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveAssignment = async (academicYearId: string | null, studentClassId: string | null) => {
    try {
      await apiClient.delete("/scheduling-rule-sets/assignments", {
        data: { academicYearId, studentClassId },
      });
      toast.success("Assignment removed");
      load();
    } catch {
      toast.error("Failed to remove assignment");
    }
  };

  const openCreate = () => {
    setEditingSet(null);
    setFormName("");
    setFormDescription("");
    setFormConfig(DEFAULT_CONFIG);
    setModalOpen(true);
  };

  const openEdit = (set: SchedulingRuleSet) => {
    setEditingSet(set);
    setFormName(set.name);
    setFormDescription(set.description ?? "");
    setFormConfig(set.config);
    setModalOpen(true);
  };

  const handleSaveSet = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = formName.trim();
    if (!nameTrimmed) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (editingSet) {
        await apiClient.patch(`/scheduling-rule-sets/${editingSet.id}`, {
          name: nameTrimmed,
          description: formDescription.trim() || null,
          config: formConfig,
        });
        toast.success("Rule set updated");
      } else {
        await apiClient.post("/scheduling-rule-sets", {
          name: nameTrimmed,
          description: formDescription.trim() || null,
          config: formConfig,
        });
        toast.success("Rule set created");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSet = async (id: string) => {
    if (!window.confirm("Delete this rule set? Assignments using it will be removed.")) return;
    try {
      await apiClient.delete(`/scheduling-rule-sets/${id}`);
      toast.success("Rule set deleted");
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete"));
    }
  };

  const assignmentLabel = (a: SchedulingRuleSetAssignment) => {
    const year = a.academicYear?.name ?? "Any year";
    const cls = a.studentClass?.name ?? "Any class";
    return `${year} · ${cls} → ${a.ruleSet?.name ?? a.ruleSetId}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link to={backTo} className="text-sm text-primary hover:underline">
          ← Back to {backTo === "/dashboard" ? "Dashboard" : "Scheduler"}
        </Link>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      </div>
      <p className="text-sm text-foreground-muted mb-6">
        {isAdminPage
          ? "Add and edit rule sets for everyone. Rule sets define how auto-schedule runs (work hours, lunch, excluded days, etc.). Assignments (which set applies per year/class) can be set here or by chairmen from the Scheduler."
          : "Rule sets define how auto-schedule runs (work hours, lunch, MWF preference, etc.). Assign a set per academic year and/or per student class; when you run Auto-schedule, the assigned set is used unless you pick another in the dropdown."}
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-medium text-foreground mb-3">Rule sets</h2>
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/50">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Description</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ruleSets.map((set) => (
                <tr key={set.id} className="border-b border-border last:border-0">
                  <td className="p-3">{set.name}</td>
                  <td className="p-3 text-foreground-muted">{set.description ?? "—"}</td>
                  <td className="p-3">{set.isSystem ? "System (default)" : "Custom"}</td>
                  <td className="p-3 text-right">
                    {!set.isSystem && (isAdminPage || isAdmin) && (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          className="p-1.5"
                          onClick={() => openEdit(set)}
                          aria-label="Edit rule set"
                          title="Edit rule set"
                        >
                          <Edit3 className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="p-1.5"
                          onClick={() => handleDeleteSet(set.id)}
                          aria-label="Delete rule set"
                          title="Delete rule set"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button type="button" variant="secondary" className="mt-3" onClick={openCreate}>
          Add rule set
        </Button>
      </section>

      <section>
        <h2 className="text-lg font-medium text-foreground mb-3">Assignments</h2>
        <p className="text-xs text-foreground-muted mb-3">
          Resolution order: exact (year + class) → year only → class only → system default.
        </p>
        <form onSubmit={handleSetAssignment} className="flex flex-wrap items-end gap-3 mb-4">
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-foreground mb-1">Academic year</label>
            <Select.Root value={assignAcademicYearId || "__any__"} onValueChange={(v) => setAssignAcademicYearId(v === "__any__" ? "" : v)}>
              <Select.Trigger className="w-full">Academic year</Select.Trigger>
              <Select.Content>
                <Select.Item value="__any__">Any (year default)</Select.Item>
                {academicYears.map((y) => (
                  <Select.Item key={y.id} value={y.id}>{y.name}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-foreground mb-1">Student class</label>
            <Select.Root value={assignStudentClassId || "__any__"} onValueChange={(v) => setAssignStudentClassId(v === "__any__" ? "" : v)}>
              <Select.Trigger className="w-full">Student class</Select.Trigger>
              <Select.Content>
                <Select.Item value="__any__">Any (class default)</Select.Item>
                {studentClasses.map((c) => (
                  <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-foreground mb-1">Rule set</label>
            <Select.Root value={assignRuleSetId} onValueChange={setAssignRuleSetId}>
              <Select.Trigger className="w-full">Rule set</Select.Trigger>
              <Select.Content>
                {ruleSets.map((r) => (
                  <Select.Item key={r.id} value={r.id}>{r.name}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          <Button type="submit" disabled={assigning || !assignRuleSetId}>
            {assigning ? "Saving…" : "Assign"}
          </Button>
        </form>
        <div className="rounded border border-border bg-surface">
          <ul className="divide-y divide-border">
            {assignments.length === 0 ? (
              <li className="p-4 text-sm text-foreground-muted">No assignments. The system default will be used.</li>
            ) : (
              assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between p-3 text-sm">
                  <span>{assignmentLabel(a)}</span>
                  {isAdmin && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="p-1.5"
                      onClick={() => handleRemoveAssignment(a.academicYearId ?? null, a.studentClassId ?? null)}
                      aria-label="Remove assignment"
                      title="Remove assignment"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Content className="!max-w-md" title={editingSet ? "Edit rule set" : "New rule set"}>
          <form onSubmit={handleSaveSet} className="flex flex-col gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded border border-border bg-surface px-3 py-2 text-foreground"
                placeholder="e.g. Standard"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Description (optional)</label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full rounded border border-border bg-surface px-3 py-2 text-foreground"
                placeholder="e.g. 08:00–17:00, avoid lunch"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Work day start</label>
                <input
                  type="time"
                  value={minutesToTimeString(formConfig.workStartMinutes)}
                  onChange={(e) => setFormConfig((c) => ({ ...c, workStartMinutes: timeStringToMinutes(e.target.value) }))}
                  className="w-full rounded border border-border bg-surface px-3 py-2 text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Work day end</label>
                <input
                  type="time"
                  value={minutesToTimeString(formConfig.workEndMinutes)}
                  onChange={(e) => setFormConfig((c) => ({ ...c, workEndMinutes: timeStringToMinutes(e.target.value) }))}
                  className="w-full rounded border border-border bg-surface px-3 py-2 text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Lunch start</label>
                <input
                  type="time"
                  value={minutesToTimeString(formConfig.lunchStartMinutes)}
                  onChange={(e) => setFormConfig((c) => ({ ...c, lunchStartMinutes: timeStringToMinutes(e.target.value) }))}
                  className="w-full rounded border border-border bg-surface px-3 py-2 text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Lunch end</label>
                <input
                  type="time"
                  value={minutesToTimeString(formConfig.lunchEndMinutes)}
                  onChange={(e) => setFormConfig((c) => ({ ...c, lunchEndMinutes: timeStringToMinutes(e.target.value) }))}
                  className="w-full rounded border border-border bg-surface px-3 py-2 text-foreground"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formConfig.avoidLunchSpan}
                  onChange={(e) => setFormConfig((c) => ({ ...c, avoidLunchSpan: e.target.checked }))}
                />
                <span>
                  Avoid assignments during lunch
                  {!formConfig.avoidLunchSpan && (
                    <span className="ml-1 text-foreground-muted">(may allow assignments on lunch)</span>
                  )}
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formConfig.requireLabBreakAfterLongLab}
                  onChange={(e) => setFormConfig((c) => ({ ...c, requireLabBreakAfterLongLab: e.target.checked }))}
                />
                <span>Require 1-hour break between 3-hour labs on the same day</span>
              </label>
              <fieldset className="flex flex-wrap gap-3 text-sm">
                <legend className="sr-only">Pattern for 3-unit lectures</legend>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="three-unit-pattern"
                    value="none"
                    checked={threeUnitPatternMode === "none"}
                    onChange={() => setThreeUnitPatternMode("none")}
                  />
                  <span>No special pattern for 3-unit lectures</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="three-unit-pattern"
                    value="mwf"
                    checked={threeUnitPatternMode === "mwf"}
                    onChange={() => setThreeUnitPatternMode("mwf")}
                  />
                  <span>Prefer MWF (3 × 1 hr)</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="three-unit-pattern"
                    value="tth"
                    checked={threeUnitPatternMode === "tth"}
                    onChange={() => setThreeUnitPatternMode("tth")}
                  />
                  <span>Prefer TTh (2 × 1.5 hr)</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="three-unit-pattern"
                    value="random3"
                    checked={threeUnitPatternMode === "random3"}
                    onChange={() => setThreeUnitPatternMode("random3")}
                  />
                  <span>Random 3 days (3 × 1 hr)</span>
                </label>
              </fieldset>
            </div>
            <div>
              <span className="block text-sm font-medium text-foreground mb-1">Avoid assignment on these days:</span>
              <div className="flex flex-wrap gap-3">
                {DAY_NAMES.map((_, i) => {
                  const dayNum = i + 1;
                  const excluded = (formConfig.excludedDays ?? []).includes(dayNum);
                  return (
                    <label key={dayNum} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={excluded}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...(formConfig.excludedDays ?? []), dayNum].sort()
                            : (formConfig.excludedDays ?? []).filter((d) => d !== dayNum);
                          setFormConfig((c) => ({ ...c, excludedDays: next }));
                        }}
                      />
                      {DAY_NAMES[i]}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
};
