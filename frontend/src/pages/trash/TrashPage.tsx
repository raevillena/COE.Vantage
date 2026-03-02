import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { Room, Department, Curriculum, Subject, StudentClass, AcademicYear, UserListItem } from "../../types/api";
import toast from "react-hot-toast";
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
  const [permanentDelete, setPermanentDelete] = useState<{ type: EntityType; id: string } | null>(null);
  const [permanentDeleteLoading, setPermanentDeleteLoading] = useState(false);

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
      await apiClient.delete(getTrashDeletePath(permanentDelete.type, permanentDelete.id));
      toast.success("Permanently deleted");
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
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            aria-label={`Actions for ${label}`}
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="6" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="18" r="1.5" />
            </svg>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item onSelect={() => handleRestore(type, id)} disabled={restoreLoading === key}>
            {restoreLoading === key ? "Restoring…" : "Restore"}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => setPermanentDelete({ type, id })}
            className="text-danger focus:bg-danger-muted focus:text-danger-hover"
          >
            Delete permanently
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    );
  };

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
              <h2 className="mb-2 text-lg font-medium text-foreground">Rooms</h2>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
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
              <h2 className="mb-2 text-lg font-medium text-foreground">Departments</h2>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Code</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Deleted at</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trash.departments.map((d) => (
                      <tr key={d.id}>
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
              <h2 className="mb-2 text-lg font-medium text-foreground">Curriculum</h2>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
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
              <h2 className="mb-2 text-lg font-medium text-foreground">Subjects</h2>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
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
              <h2 className="mb-2 text-lg font-medium text-foreground">Student classes</h2>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
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
              <h2 className="mb-2 text-lg font-medium text-foreground">Academic years</h2>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Deleted at</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trash.academicYears.map((y) => (
                      <tr key={y.id}>
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
              <h2 className="mb-2 text-lg font-medium text-foreground">Users</h2>
              <div className="rounded border border-border bg-surface overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
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
