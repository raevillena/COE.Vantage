import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { Room, Department, Curriculum, Subject, StudentClass, AcademicYear, UserListItem } from "../../types/api";
import toast from "react-hot-toast";
import { MoreVertical, RotateCcw } from "lucide-react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";

type EntityType = "rooms" | "departments" | "curriculum" | "subjects" | "student-classes" | "academic-years" | "users";

interface TrashState {
  rooms: Room[];
  departments: Department[];
  curriculum: Curriculum[];
  subjects: Subject[];
  studentClasses: StudentClass[];
  academicYears: AcademicYear[];
  users: UserListItem[];
}

type SelectedMap = Record<EntityType, string[]>;

function formatDeletedAt(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return String(s);
  }
}

function getRestorePath(type: EntityType, id: string): string {
  return `/${type === "student-classes" ? "student-classes" : type}/${id}/restore`;
}

function getTrashDeletePath(type: EntityType, id: string): string {
  const base = type === "student-classes" ? "/student-classes" : `/${type}`;
  return `${base}/trash/${id}`;
}

/** Checkbox that supports indeterminate state (set via ref; not in React's input props). */
function IndeterminateCheckbox(
  props: React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }
) {
  const { indeterminate, ...rest } = props;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate ?? false;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" {...rest} />;
}

export function TrashPage() {
  const [trash, setTrash] = useState<TrashState>({
    rooms: [],
    departments: [],
    curriculum: [],
    subjects: [],
    studentClasses: [],
    academicYears: [],
    users: [],
  });
  const [loading, setLoading] = useState(true);
  const [restoreLoading, setRestoreLoading] = useState<string | null>(null);
  const [permanentDelete, setPermanentDelete] = useState<{ type: EntityType; ids: string[] } | null>(null);
  const [permanentDeleteLoading, setPermanentDeleteLoading] = useState(false);
  const [selected, setSelected] = useState<SelectedMap>({
    rooms: [],
    departments: [],
    curriculum: [],
    subjects: [],
    "student-classes": [],
    "academic-years": [],
    users: [],
  });

  const load = async () => {
    setLoading(true);
    try {
      const [rooms, departments, curriculum, subjects, studentClasses, academicYears, users] = await Promise.all([
        apiClient.get<Room[]>("/rooms/trash").then((r) => r.data),
        apiClient.get<Department[]>("/departments/trash").then((r) => r.data),
        apiClient.get<Curriculum[]>("/curriculum/trash").then((r) => r.data),
        apiClient.get<Subject[]>("/subjects/trash").then((r) => r.data),
        apiClient.get<StudentClass[]>("/student-classes/trash").then((r) => r.data),
        apiClient.get<AcademicYear[]>("/academic-years/trash").then((r) => r.data),
        apiClient.get<UserListItem[]>("/users/trash").then((r) => r.data),
      ]);
      setTrash({
        rooms,
        departments,
        curriculum,
        subjects,
        studentClasses,
        academicYears,
        users,
      });
      // Clear selections after refresh so we don't keep IDs that may no longer exist
      setSelected({
        rooms: [],
        departments: [],
        curriculum: [],
        subjects: [],
        "student-classes": [],
        "academic-years": [],
        users: [],
      });
    } catch {
      toast.error("Failed to load trash");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRestore = async (type: EntityType, id: string) => {
    const key = `${type}-${id}`;
    setRestoreLoading(key);
    try {
      await apiClient.post(getRestorePath(type, id));
      toast.success("Restored");
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to restore";
      toast.error(msg);
    } finally {
      setRestoreLoading(null);
    }
  };

  const handlePermanentDeleteConfirm = async () => {
    if (!permanentDelete) return;
    setPermanentDeleteLoading(true);
    try {
      const { type, ids } = permanentDelete;
      for (const id of ids) {
        // Delete one by one; backend endpoints are per-id
        // If one fails, we surface the error and stop further deletions
        // to avoid a half-unknown state in the UI.
        // The list is reloaded afterwards to reflect the final state.
        // eslint-disable-next-line no-await-in-loop
        await apiClient.delete(getTrashDeletePath(type, id));
      }
      toast.success(ids.length > 1 ? `Permanently deleted ${ids.length} items` : "Permanently deleted");
      setPermanentDelete(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to delete";
      toast.error(msg);
    } finally {
      setPermanentDeleteLoading(false);
    }
  };

  const totalCount =
    trash.rooms.length +
    trash.departments.length +
    trash.curriculum.length +
    trash.subjects.length +
    trash.studentClasses.length +
    trash.academicYears.length +
    trash.users.length;

  const actionsMenu = (type: EntityType, id: string, label: string) => {
    const key = `${type}-${id}`;
    return (
      <div className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={() => handleRestore(type, id)}
          disabled={restoreLoading === key}
          className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 disabled:opacity-50"
          aria-label={`Restore ${label}`}
          title="Restore"
        >
          <RotateCcw size={20} className="shrink-0" aria-hidden />
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              aria-label={`Actions for ${label}`}
            >
              <MoreVertical size={20} className="shrink-0" aria-hidden />
            </button>
          </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item onSelect={() => handleRestore(type, id)} disabled={restoreLoading === key}>
            {restoreLoading === key ? "Restoring…" : "Restore"}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => setPermanentDelete({ type, ids: [id] })}
            className="text-danger focus:bg-danger-muted focus:text-danger-hover"
          >
            Delete permanently
          </DropdownMenu.Item>
        </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    );
  };

  const isSelected = (type: EntityType, id: string) => selected[type].includes(id);

  const toggleSelected = (type: EntityType, id: string) => {
    setSelected((prev) => {
      const list = prev[type];
      const exists = list.includes(id);
      const nextList = exists ? list.filter((x) => x !== id) : [...list, id];
      return { ...prev, [type]: nextList };
    });
  };

  const selectAllForType = (type: EntityType, ids: string[]) => {
    setSelected((prev) => ({
      ...prev,
      [type]: ids,
    }));
  };

  const clearSelectionForType = (type: EntityType) => {
    setSelected((prev) => ({
      ...prev,
      [type]: [],
    }));
  };

  const selectedCountForType = (type: EntityType) => selected[type].length;

  if (loading) {
    return (
      <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-foreground">Trash</h1>
      </div>
      <p className="mb-6 text-sm text-foreground-muted">
        Items moved to trash can be restored or permanently deleted here. Only admins can access Trash.
      </p>

      {totalCount === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted">Trash is empty.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {trash.rooms.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-medium text-foreground">Rooms</h2>
                {selectedCountForType("rooms") > 0 && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-foreground-muted">
                      {selectedCountForType("rooms")} selected
                    </p>
                    <Button
                      type="button"
                      variant="danger"
                      size="xs"
                      onClick={() =>
                        setPermanentDelete({
                          type: "rooms",
                          ids: selected.rooms,
                        })
                      }
                    >
                      Delete selected
                    </Button>
                  </div>
                )}
              </div>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">
                        <IndeterminateCheckbox
                          className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                          aria-label="Select all rooms"
                          checked={
                            selected.rooms.length > 0 &&
                            selected.rooms.length === trash.rooms.length
                          }
                          indeterminate={
                            selected.rooms.length > 0 &&
                            selected.rooms.length < trash.rooms.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllForType(
                                "rooms",
                                trash.rooms.map((r) => r.id),
                              );
                            } else {
                              clearSelectionForType("rooms");
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Capacity</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Lab</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Department</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Deleted at</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trash.rooms.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                            aria-label={`Select room ${r.name}`}
                            checked={isSelected("rooms", r.id)}
                            onChange={() => toggleSelected("rooms", r.id)}
                          />
                        </td>
                        <td className="px-4 py-2 text-foreground">{r.name}</td>
                        <td className="px-4 py-2 text-foreground-muted">{r.capacity}</td>
                        <td className="px-4 py-2 text-foreground-muted">{r.isLab ? "Yes" : "No"}</td>
                        <td className="px-4 py-2 text-foreground-muted">{r.department?.name ?? "—"}</td>
                        <td className="px-4 py-2 text-foreground-muted">{formatDeletedAt(r.deletedAt)}</td>
                        <td className="px-4 py-2 text-right">{actionsMenu("rooms", r.id, r.name)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {trash.departments.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-medium text-foreground">Departments</h2>
                {selectedCountForType("departments") > 0 && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-foreground-muted">
                      {selectedCountForType("departments")} selected
                    </p>
                    <Button
                      type="button"
                      variant="danger"
                      size="xs"
                      onClick={() =>
                        setPermanentDelete({
                          type: "departments",
                          ids: selected.departments,
                        })
                      }
                    >
                      Delete selected
                    </Button>
                  </div>
                )}
              </div>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">
                        <IndeterminateCheckbox
                          className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                          aria-label="Select all departments"
                          checked={
                            selected.departments.length > 0 &&
                            selected.departments.length === trash.departments.length
                          }
                          indeterminate={
                            selected.departments.length > 0 &&
                            selected.departments.length < trash.departments.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllForType(
                                "departments",
                                trash.departments.map((d) => d.id),
                              );
                            } else {
                              clearSelectionForType("departments");
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Code</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Deleted at</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trash.departments.map((d) => (
                      <tr key={d.id}>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                            aria-label={`Select department ${d.name}`}
                            checked={isSelected("departments", d.id)}
                            onChange={() => toggleSelected("departments", d.id)}
                          />
                        </td>
                        <td className="px-4 py-2 text-foreground">{d.name}</td>
                        <td className="px-4 py-2 text-foreground-muted">{d.code ?? "—"}</td>
                        <td className="px-4 py-2 text-foreground-muted">{formatDeletedAt(d.deletedAt)}</td>
                        <td className="px-4 py-2 text-right">{actionsMenu("departments", d.id, d.name)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {trash.curriculum.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-medium text-foreground">Curriculum</h2>
                {selectedCountForType("curriculum") > 0 && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-foreground-muted">
                      {selectedCountForType("curriculum")} selected
                    </p>
                    <Button
                      type="button"
                      variant="danger"
                      size="xs"
                      onClick={() =>
                        setPermanentDelete({
                          type: "curriculum",
                          ids: selected.curriculum,
                        })
                      }
                    >
                      Delete selected
                    </Button>
                  </div>
                )}
              </div>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">
                        <IndeterminateCheckbox
                          className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                          aria-label="Select all curriculum items"
                          checked={
                            selected.curriculum.length > 0 &&
                            selected.curriculum.length === trash.curriculum.length
                          }
                          indeterminate={
                            selected.curriculum.length > 0 &&
                            selected.curriculum.length < trash.curriculum.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllForType(
                                "curriculum",
                                trash.curriculum.map((c) => c.id),
                              );
                            } else {
                              clearSelectionForType("curriculum");
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Code</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Department</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Deleted at</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trash.curriculum.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                            aria-label={`Select curriculum ${c.name}`}
                            checked={isSelected("curriculum", c.id)}
                            onChange={() => toggleSelected("curriculum", c.id)}
                          />
                        </td>
                        <td className="px-4 py-2 text-foreground">{c.name}</td>
                        <td className="px-4 py-2 text-foreground-muted">{c.code ?? "—"}</td>
                        <td className="px-4 py-2 text-foreground-muted">{c.department?.name ?? "—"}</td>
                        <td className="px-4 py-2 text-foreground-muted">{formatDeletedAt(c.deletedAt)}</td>
                        <td className="px-4 py-2 text-right">{actionsMenu("curriculum", c.id, c.name)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {trash.subjects.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-medium text-foreground">Subjects</h2>
                {selectedCountForType("subjects") > 0 && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-foreground-muted">
                      {selectedCountForType("subjects")} selected
                    </p>
                    <Button
                      type="button"
                      variant="danger"
                      size="xs"
                      onClick={() =>
                        setPermanentDelete({
                          type: "subjects",
                          ids: selected.subjects,
                        })
                      }
                    >
                      Delete selected
                    </Button>
                  </div>
                )}
              </div>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">
                        <IndeterminateCheckbox
                          className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                          aria-label="Select all subjects"
                          checked={
                            selected.subjects.length > 0 &&
                            selected.subjects.length === trash.subjects.length
                          }
                          indeterminate={
                            selected.subjects.length > 0 &&
                            selected.subjects.length < trash.subjects.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllForType(
                                "subjects",
                                trash.subjects.map((s) => s.id),
                              );
                            } else {
                              clearSelectionForType("subjects");
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Code</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Units</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Deleted at</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trash.subjects.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                            aria-label={`Select subject ${s.code}`}
                            checked={isSelected("subjects", s.id)}
                            onChange={() => toggleSelected("subjects", s.id)}
                          />
                        </td>
                        <td className="px-4 py-2 text-foreground">{s.code}</td>
                        <td className="px-4 py-2 text-foreground">{s.name}</td>
                        <td className="px-4 py-2 text-foreground-muted">{s.units}</td>
                        <td className="px-4 py-2 text-foreground-muted">{formatDeletedAt(s.deletedAt)}</td>
                        <td className="px-4 py-2 text-right">{actionsMenu("subjects", s.id, s.name)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {trash.studentClasses.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-medium text-foreground">Student classes</h2>
                {selectedCountForType("student-classes") > 0 && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-foreground-muted">
                      {selectedCountForType("student-classes")} selected
                    </p>
                    <Button
                      type="button"
                      variant="danger"
                      size="xs"
                      onClick={() =>
                        setPermanentDelete({
                          type: "student-classes",
                          ids: selected["student-classes"],
                        })
                      }
                    >
                      Delete selected
                    </Button>
                  </div>
                )}
              </div>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">
                        <IndeterminateCheckbox
                          className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                          aria-label="Select all student classes"
                          checked={
                            selected["student-classes"].length > 0 &&
                            selected["student-classes"].length === trash.studentClasses.length
                          }
                          indeterminate={
                            selected["student-classes"].length > 0 &&
                            selected["student-classes"].length < trash.studentClasses.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllForType(
                                "student-classes",
                                trash.studentClasses.map((c) => c.id),
                              );
                            } else {
                              clearSelectionForType("student-classes");
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Year</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Curriculum</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Deleted at</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trash.studentClasses.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                            aria-label={`Select student class ${c.name}`}
                            checked={isSelected("student-classes", c.id)}
                            onChange={() => toggleSelected("student-classes", c.id)}
                          />
                        </td>
                        <td className="px-4 py-2 text-foreground">{c.name}</td>
                        <td className="px-4 py-2 text-foreground-muted">{c.yearLevel}</td>
                        <td className="px-4 py-2 text-foreground-muted">{c.curriculum?.name ?? "—"}</td>
                        <td className="px-4 py-2 text-foreground-muted">{formatDeletedAt(c.deletedAt)}</td>
                        <td className="px-4 py-2 text-right">{actionsMenu("student-classes", c.id, c.name)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {trash.academicYears.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-medium text-foreground">Academic years</h2>
                {selectedCountForType("academic-years") > 0 && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-foreground-muted">
                      {selectedCountForType("academic-years")} selected
                    </p>
                    <Button
                      type="button"
                      variant="dangerOutline"
                      size="xs"
                      onClick={() =>
                        setPermanentDelete({
                          type: "academic-years",
                          ids: selected["academic-years"],
                        })
                      }
                    >
                      Delete selected
                    </Button>
                  </div>
                )}
              </div>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">
                        <IndeterminateCheckbox
                          className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                          aria-label="Select all academic years"
                          checked={
                            selected["academic-years"].length > 0 &&
                            selected["academic-years"].length === trash.academicYears.length
                          }
                          indeterminate={
                            selected["academic-years"].length > 0 &&
                            selected["academic-years"].length < trash.academicYears.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllForType(
                                "academic-years",
                                trash.academicYears.map((y) => y.id),
                              );
                            } else {
                              clearSelectionForType("academic-years");
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Deleted at</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trash.academicYears.map((y) => (
                      <tr key={y.id}>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                            aria-label={`Select academic year ${y.name}`}
                            checked={isSelected("academic-years", y.id)}
                            onChange={() => toggleSelected("academic-years", y.id)}
                          />
                        </td>
                        <td className="px-4 py-2 text-foreground">{y.name}</td>
                        <td className="px-4 py-2 text-foreground-muted">{formatDeletedAt(y.deletedAt)}</td>
                        <td className="px-4 py-2 text-right">{actionsMenu("academic-years", y.id, y.name)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {trash.users.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-medium text-foreground">Users</h2>
                {selectedCountForType("users") > 0 && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-foreground-muted">
                      {selectedCountForType("users")} selected
                    </p>
                    <Button
                      type="button"
                      variant="dangerOutline"
                      size="xs"
                      onClick={() =>
                        setPermanentDelete({
                          type: "users",
                          ids: selected.users,
                        })
                      }
                    >
                      Delete selected
                    </Button>
                  </div>
                )}
              </div>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-foreground">
                          <IndeterminateCheckbox
                            className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                            aria-label="Select all users"
                            checked={
                              selected.users.length > 0 &&
                              selected.users.length === trash.users.length
                            }
                            indeterminate={
                              selected.users.length > 0 &&
                              selected.users.length < trash.users.length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                selectAllForType(
                                  "users",
                                  trash.users.map((u) => u.id),
                                );
                              } else {
                                clearSelectionForType("users");
                              }
                            }}
                          />
                        </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Email</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Role</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Deleted at</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trash.users.map((u) => (
                      <tr key={u.id}>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border text-primary focus:ring-focus-ring"
                            aria-label={`Select user ${u.name}`}
                            checked={isSelected("users", u.id)}
                            onChange={() => toggleSelected("users", u.id)}
                          />
                        </td>
                        <td className="px-4 py-2 text-foreground">{u.name}</td>
                        <td className="px-4 py-2 text-foreground-muted">{u.email}</td>
                        <td className="px-4 py-2 text-foreground-muted">{u.role}</td>
                        <td className="px-4 py-2 text-foreground-muted">{formatDeletedAt(u.deletedAt)}</td>
                        <td className="px-4 py-2 text-right">{actionsMenu("users", u.id, u.name)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      <Dialog.Root open={permanentDelete !== null} onOpenChange={(open) => !open && setPermanentDelete(null)}>
        <Dialog.Content
          title="Delete permanently"
          description="This cannot be undone. Related data may be affected. Are you sure?"
        >
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              variant="danger"
              onClick={handlePermanentDeleteConfirm}
              disabled={permanentDeleteLoading}
            >
              {permanentDeleteLoading ? "…" : "Delete permanently"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
