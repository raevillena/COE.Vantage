import { useEffect, useState, type ChangeEvent } from "react";
import { ClipboardList, Mail, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import type { UserListItem } from "../../types/api";
import type { Role } from "../../types/auth";
import toast from "react-hot-toast";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";
import {
  parseFacultyPaste,
  groupByDepartment,
  formatEmailFromName,
} from "./facultyImportUtils";

function inferRoleFromStatus(status: string): Role {
  const s = status.toLowerCase();
  if (s.includes("dean")) return "DEAN";
  if (s.includes("chair")) return "CHAIRMAN";
  if (s.includes("officer")) return "OFFICER";
  return "FACULTY";
}

function inferRoleFromTextOrStatus(roleText: string | undefined, status: string): Role {
  const raw = (roleText ?? "").trim().toUpperCase();
  if (raw === "ADMIN") return "ADMIN";
  if (raw === "DEAN") return "DEAN";
  if (raw === "CHAIR" || raw === "CHAIRMAN") return "CHAIRMAN";
  if (raw === "OFFICER") return "OFFICER";
  if (raw === "FACULTY") return "FACULTY";
  return inferRoleFromStatus(status);
}

/** One editable row in the import preview (name/status from paste; email and role editable). */
interface ImportRow {
  name: string;
  status: string;
  email: string;
  role: Role;
  maxUnits: number | null;
}

/** A department group in the import preview: raw label from paste + selected DB department + rows. */
interface ImportGroup {
  rawDepartment: string;
  departmentId: string;
  rows: ImportRow[];
}

/** Subject prioritization row from GET /users/:id/prioritized-subjects */
interface PrioritizedSubjectItem {
  subjectId: string;
  priority: number;
  code: string;
  name: string;
  units: number;
  isLab: boolean;
}

export function UsersPage() {
  const [list, setList] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "FACULTY" as Role, departmentId: "", status: "", maxUnits: "18" });
  const [departments, setDepartments] = useState<{ id: string; name: string; code?: string | null }[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [resetEmailLoading, setResetEmailLoading] = useState<string | null>(null);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importPasteText, setImportPasteText] = useState("");
  const [importGroups, setImportGroups] = useState<ImportGroup[]>([]);
  const [importDefaultPassword, setImportDefaultPassword] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [prioritizationUser, setPrioritizationUser] = useState<UserListItem | null>(null);
  const [prioritizationList, setPrioritizationList] = useState<PrioritizedSubjectItem[]>([]);
  const [prioritizationLoading, setPrioritizationLoading] = useState(false);

  const handleSendResetEmail = async (email: string) => {
    setResetEmailLoading(email);
    try {
      await apiClient.post("/auth/send-password-reset-email", { email });
      toast.success("Password reset email sent to " + email);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to send";
      toast.error(msg);
    } finally {
      setResetEmailLoading(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<UserListItem[]>("/users");
      setList(data);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    apiClient.get("/departments").then(({ data }) => setDepartments(data));
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ email: "", password: "", name: "", role: "FACULTY", departmentId: "", status: "", maxUnits: "18" });
    setModalOpen(true);
  };

  const openEdit = (u: UserListItem) => {
    setEditingId(u.id);
    setForm({
      email: u.email,
      password: "",
      name: u.name,
      role: u.role,
      departmentId: u.departmentId ?? "",
      status: u.status ?? "",
      maxUnits: u.maxUnits != null ? String(u.maxUnits) : "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = form.name.trim();
    const emailTrimmed = form.email.trim();
    if (!nameTrimmed) {
      toast.error("Name is required");
      return;
    }
    if (!emailTrimmed) {
      toast.error("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      toast.error("Enter a valid email address");
      return;
    }
    if (!editingId && !form.password.trim()) {
      toast.error("Password is required when creating a user");
      return;
    }
    const maxUnitsParsed = form.maxUnits.trim() ? parseInt(form.maxUnits.trim(), 10) : null;
    if (form.maxUnits.trim() && (Number.isNaN(maxUnitsParsed) || maxUnitsParsed! < 0)) {
      toast.error("Max units must be 0 or a positive number if set (0 = cannot receive any load)");
      return;
    }
    try {
      const payload = {
        email: emailTrimmed,
        name: nameTrimmed,
        role: form.role,
        departmentId: form.departmentId || null,
        status: form.status.trim() || null,
        maxUnits: maxUnitsParsed ?? null,
      };
      if (editingId) {
        await apiClient.patch(`/users/${editingId}`, payload);
        toast.success("User updated");
      } else {
        await apiClient.post("/users", { ...payload, password: form.password });
        toast.success("User created");
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    }
  };

  const handleDeleteClick = (id: string) => setDeleteConfirmId(id);

  const openViewPrioritization = async (u: UserListItem) => {
    setPrioritizationUser(u);
    setPrioritizationList([]);
    setPrioritizationLoading(true);
    try {
      const { data } = await apiClient.get<PrioritizedSubjectItem[]>(`/users/${u.id}/prioritized-subjects`);
      setPrioritizationList(data);
    } catch {
      toast.error("Failed to load faculty prioritization");
      setPrioritizationUser(null);
    } finally {
      setPrioritizationLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/users/${deleteConfirmId}`);
      toast.success("User moved to trash");
      setDeleteConfirmId(null);
      load();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteLoading(false);
    }
  };

  const buildImportGroupsFromText = (text: string) => {
    const rows = parseFacultyPaste(text);
    if (rows.length === 0) {
      toast.error("No valid rows. Use tab or comma separated: Name, Status, Department");
      return false;
    }
    const byDept = groupByDepartment(rows);
    const groups: ImportGroup[] = [];
    byDept.forEach((groupRows, rawDepartment) => {
      const normalizedRaw = rawDepartment.trim().toLowerCase();
      const matchedDept = departments.find((d) => {
        const name = d.name.trim().toLowerCase();
        const code = (d.code ?? "").trim().toLowerCase();
        if (!normalizedRaw) return false;
        if (normalizedRaw === name || (code && normalizedRaw === code)) return true;
        if (normalizedRaw.includes(name) || name.includes(normalizedRaw)) return true;
        if (code && (normalizedRaw.includes(code) || code.includes(normalizedRaw))) return true;
        return false;
      });
      groups.push({
        rawDepartment,
        departmentId: matchedDept?.id ?? "",
        rows: groupRows.map((r) => ({
          name: r.name,
          status: r.status,
          email: formatEmailFromName(r.name),
          role: inferRoleFromTextOrStatus(r.roleText, r.status),
          maxUnits: (() => {
            const raw = (r.maxUnitsText ?? "").trim();
            const parsed = raw === "" ? NaN : Number(raw);
            // Explicit number from file (including 0): use it. 0 = faculty cannot receive any load. Blank: apply default.
            if (!Number.isNaN(parsed) && parsed >= 0) return Math.floor(parsed);
            const role = inferRoleFromTextOrStatus(r.roleText, r.status);
            if (role === "FACULTY" || role === "CHAIRMAN") return 18;
            return null;
          })(),
        })),
      });
    });
    setImportGroups(groups);
    return true;
  };

  const handleImportParse = () => {
    buildImportGroupsFromText(importPasteText);
  };

  const setImportGroupDepartmentId = (groupIndex: number, departmentId: string) => {
    setImportGroups((prev) =>
      prev.map((g, i) => (i === groupIndex ? { ...g, departmentId } : g))
    );
  };

  const setImportRow = (groupIndex: number, rowIndex: number, patch: Partial<ImportRow>) => {
    setImportGroups((prev) =>
      prev.map((g, i) => {
        if (i !== groupIndex) return g;
        return {
          ...g,
          rows: g.rows.map((r, j) => (j === rowIndex ? { ...r, ...patch } : r)),
        };
      })
    );
  };

  const handleImportFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (!text.trim()) {
        toast.error("File is empty");
        return;
      }
      setImportPasteText(text);
      setImportFileName(file.name);
      buildImportGroupsFromText(text);
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleImportSubmit = async () => {
    const defaultPassword = importDefaultPassword.trim();
    if (!defaultPassword || defaultPassword.length < 8) {
      toast.error("Default password is required (min 8 characters) for imported users");
      return;
    }
    const flat: { name: string; email: string; role: Role; departmentId: string; password: string; status: string | null; maxUnits: number | null }[] = [];
    for (const g of importGroups) {
      if (!g.departmentId) {
        toast.error(`Select a department for group "${g.rawDepartment}"`);
        return;
      }
      for (const row of g.rows) {
        const email = row.email.trim();
        if (!email) {
          toast.error(`Email required for ${row.name}`);
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          toast.error(`Invalid email for ${row.name}: ${email}`);
          return;
        }
        flat.push({
          name: row.name.trim(),
          email,
          role: row.role,
          departmentId: g.departmentId,
          password: defaultPassword,
          status: row.status.trim() || null,
          maxUnits: row.maxUnits,
        });
      }
    }
    if (flat.length === 0) {
      toast.error("No users to create");
      return;
    }
    setImportLoading(true);
    let created = 0;
    let failed = 0;
    try {
      for (const user of flat) {
        try {
          await apiClient.post("/users", {
            email: user.email,
            name: user.name,
            role: user.role,
            departmentId: user.departmentId,
            password: user.password,
            status: user.status,
            maxUnits: user.maxUnits,
          });
          created += 1;
        } catch (err: unknown) {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
          toast.error(`${user.name}: ${msg}`);
          failed += 1;
        }
      }
      if (created > 0) {
        toast.success(`Created ${created} user(s)${failed > 0 ? `; ${failed} failed` : ""}`);
        setImportModalOpen(false);
        setImportPasteText("");
        setImportGroups([]);
        load();
      }
    } finally {
      setImportLoading(false);
    }
  };

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredList = searchLower
    ? list.filter(
        (u) =>
          u.name.toLowerCase().includes(searchLower) ||
          u.email.toLowerCase().includes(searchLower) ||
          u.role.toLowerCase().includes(searchLower) ||
          (u.department?.name ?? "").toLowerCase().includes(searchLower) ||
          (u.status ?? "").toLowerCase().includes(searchLower)
      )
    : list;

  return (
    <div>
      <div className="mb-4 flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Users</h1>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setImportModalOpen(true);
              setImportPasteText("");
              setImportGroups([]);
              setImportDefaultPassword("");
              setImportFileName("");
            }}
          >
            Import faculty
          </Button>
          <Button type="button" onClick={openCreate}>Add User</Button>
        </div>
      </div>
      {list.length > 0 && (
        <div className="mb-4 relative max-w-md">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" aria-hidden>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </span>
          <input
            type="search"
            placeholder="Search by name, email, role, or department…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-border-strong py-2 pl-9 pr-3 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            aria-label="Search users"
          />
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No users yet. Add one to get started.</p>
          <Button type="button" onClick={openCreate}>Add User</Button>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No users match &quot;{searchQuery.trim()}&quot;.</p>
          <button type="button" onClick={() => setSearchQuery("")} className="text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 rounded">
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
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Role</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Status</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Department</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Max units</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredList.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-foreground">{u.name}</td>
                  <td className="px-4 py-2 text-foreground-muted">{u.email}</td>
                  <td className="px-4 py-2 text-foreground-muted">{u.role}</td>
                  <td className="px-4 py-2 text-foreground-muted">{u.status ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground-muted">{u.department?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground-muted">{(u.role === "FACULTY" || u.role === "CHAIRMAN") && u.maxUnits != null ? u.maxUnits : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                        aria-label={`Edit ${u.name}`}
                        title="Edit"
                      >
                        <Pencil size={20} className="shrink-0" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => openViewPrioritization(u)}
                        className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                        aria-label="View faculty prioritization"
                        title="View prioritization"
                      >
                        <ClipboardList size={20} className="shrink-0" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendResetEmail(u.email)}
                        disabled={resetEmailLoading === u.email}
                        className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 disabled:opacity-50"
                        aria-label="Send password reset email"
                        title="Send password reset"
                      >
                        <Mail size={20} className="shrink-0" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(u.id)}
                        className="rounded p-1.5 text-foreground-muted hover:bg-danger-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                        aria-label="Move to trash"
                        title="Move to trash"
                      >
                        <Trash2 size={20} className="shrink-0" aria-hidden />
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
                          <DropdownMenu.Item onSelect={() => openEdit(u)}>Edit</DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={() => openViewPrioritization(u)}>View prioritization</DropdownMenu.Item>
                          <DropdownMenu.Item
                            onSelect={() => handleSendResetEmail(u.email)}
                            disabled={resetEmailLoading === u.email}
                          >
                            {resetEmailLoading === u.email ? "Sending…" : "Send password reset email"}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            onSelect={() => handleDeleteClick(u.id)}
                            className="text-danger focus:bg-danger-muted focus:text-danger-hover"
                          >
                            Move to trash
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
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Content title={editingId ? "Edit User" : "Add User"}>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            {!editingId && (
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full rounded border border-border-strong px-3 py-2 pr-10 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                  aria-label="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-foreground-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={0}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Role</label>
              <Select.Root value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}>
                <Select.Trigger aria-label="Role">
                  <Select.Value placeholder="Role" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="ADMIN">ADMIN</Select.Item>
                  <Select.Item value="DEAN">DEAN</Select.Item>
                  <Select.Item value="CHAIRMAN">CHAIRMAN</Select.Item>
                  <Select.Item value="FACULTY">FACULTY</Select.Item>
                  <Select.Item value="OFFICER">OFFICER</Select.Item>
                </Select.Content>
              </Select.Root>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Department</label>
              <Select.Root value={form.departmentId || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v === "__none__" ? "" : v }))}>
                <Select.Trigger aria-label="Department">
                  <Select.Value placeholder="No department" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="__none__">No department</Select.Item>
                  {departments.map((d) => (
                    <Select.Item key={d.id} value={d.id}>{d.name}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Status</label>
              <input
                placeholder="e.g. Full-time, Part-time"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                aria-label="Status"
              />
            </div>
            {(form.role === "FACULTY" || form.role === "CHAIRMAN") && (
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Max units per term</label>
                <input
                  type="number"
                  min={0}
                  placeholder="0 = no load, or leave blank for no limit"
                  value={form.maxUnits}
                  onChange={(e) => setForm((f) => ({ ...f, maxUnits: e.target.value }))}
                  className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                  aria-label="Max units per term"
                />
                <p className="mt-0.5 text-xs text-foreground-muted">Optional. Caps total assigned units per semester for load assignment.</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <Dialog.Content title="Move user to trash" description="This user will be moved to Trash. They will not be able to sign in until restored. You can restore or permanently delete from the Trash page.">
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

      <Dialog.Root open={prioritizationUser !== null} onOpenChange={(open) => !open && setPrioritizationUser(null)}>
        <Dialog.Content className="!max-w-2xl" title={`Faculty prioritization — ${prioritizationUser?.name ?? ""}`} description="Subjects this faculty is prioritized to teach (set per subject on the Subjects page).">
          <div className="mt-4">
            {prioritizationLoading ? (
              <div className="flex justify-center py-8" aria-busy="true">
                <Spinner />
              </div>
            ) : prioritizationList.length === 0 ? (
              <p className="py-6 text-center text-foreground-muted">No subject prioritization. Prioritization is set per subject under Subjects → Set prioritized faculty.</p>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {prioritizationList.map((row, idx) => (
                      <tr key={row.subjectId}>
                        <td className="px-3 py-2 text-foreground-muted">{idx + 1}</td>
                        <td className="px-3 py-2 text-foreground">{row.code}</td>
                        <td className="px-3 py-2 text-foreground">{row.name}</td>
                        <td className="px-3 py-2 text-foreground-muted">{row.units}</td>
                        <td className="px-3 py-2 text-foreground-muted">{row.isLab ? "Yes" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={importModalOpen} onOpenChange={setImportModalOpen}>
        <Dialog.Content
          className="!max-w-5xl w-full"
          title="Import faculty from Excel / Sheets"
          description="Paste directly from Excel/Sheets (tab- or comma-separated) or upload a CSV/TSV file. Preview will be grouped by department; set role and edit emails before creating."
        >
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Pasted list</label>
              <textarea
                placeholder="e.g.&#10;Juan Dela Cruz, Full-time, CPE&#10;Maria Santos, Part-time, CPE"
                value={importPasteText}
                onChange={(e) => setImportPasteText(e.target.value)}
                rows={5}
                className="w-full rounded border border-border-strong px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                aria-label="Paste faculty list"
              />
              <Button type="button" variant="secondary" onClick={handleImportParse} className="mt-2">
                Parse and preview
              </Button>
            </div>

            <div className="space-y-1">
              <label className="mb-1 block text-sm font-medium text-foreground">
                Or upload CSV/TSV file from Excel/Sheets
              </label>
              <input
                type="file"
                accept=".csv,.tsv,text/csv,application/vnd.ms-excel"
                onChange={handleImportFileChange}
                className="block w-full text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-surface-hover"
              />
              {importFileName && (
                <p className="text-xs text-foreground-muted">
                  Selected file: {importFileName}
                </p>
              )}
            </div>

            {importGroups.length > 0 && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Default password for all imported users</label>
                  <div className="relative">
                    <input
                      type={showImportPassword ? "text" : "password"}
                      placeholder="Min 8 characters"
                      value={importDefaultPassword}
                      onChange={(e) => setImportDefaultPassword(e.target.value)}
                      className="w-full rounded border border-border-strong px-3 py-2 pr-10 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                      aria-label="Default password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowImportPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-foreground-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                      aria-label={showImportPassword ? "Hide password" : "Show password"}
                      tabIndex={0}
                    >
                      {showImportPassword ? (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                </div>
                <div className="max-h-[50vh] overflow-y-auto space-y-6 rounded border border-border bg-surface-muted/50 p-3">
                  {importGroups.map((group, gIdx) => (
                    <div key={gIdx} className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{group.rawDepartment}</span>
                        <Select.Root
                          value={group.departmentId || "__none__"}
                          onValueChange={(v) => setImportGroupDepartmentId(gIdx, v === "__none__" ? "" : v)}
                        >
                          <Select.Trigger aria-label="Assign department" className="w-48">
                            <Select.Value placeholder="Select department" />
                          </Select.Trigger>
                          <Select.Content>
                            <Select.Item value="__none__">Select department</Select.Item>
                            {departments.map((d) => (
                              <Select.Item key={d.id} value={d.id}>{d.name}</Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Root>
                      </div>
                      <table className="min-w-full text-sm border border-border rounded overflow-hidden">
                        <thead className="bg-surface-muted">
                          <tr>
                            <th className="px-2 py-1.5 text-left font-medium text-foreground">Name</th>
                            <th className="px-2 py-1.5 text-left font-medium text-foreground">Status</th>
                            <th className="px-2 py-1.5 text-left font-medium text-foreground">Role</th>
                            <th className="px-2 py-1.5 text-left font-medium text-foreground">Max units</th>
                            <th className="px-2 py-1.5 text-left font-medium text-foreground">Email</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {group.rows.map((row, rIdx) => (
                            <tr key={rIdx}>
                              <td className="px-2 py-1.5 text-foreground">{row.name}</td>
                              <td className="px-2 py-1.5 text-foreground-muted">{row.status || "—"}</td>
                              <td className="px-2 py-1.5">
                                <Select.Root
                                  value={row.role}
                                  onValueChange={(v) => setImportRow(gIdx, rIdx, { role: v as Role })}
                                >
                                  <Select.Trigger aria-label="Role" className="h-8 min-w-[7rem]">
                                    <Select.Value />
                                  </Select.Trigger>
                                  <Select.Content>
                                    <Select.Item value="FACULTY">FACULTY</Select.Item>
                                    <Select.Item value="CHAIRMAN">CHAIRMAN</Select.Item>
                                    <Select.Item value="DEAN">DEAN</Select.Item>
                                    <Select.Item value="OFFICER">OFFICER</Select.Item>
                                    <Select.Item value="ADMIN">ADMIN</Select.Item>
                                  </Select.Content>
                                </Select.Root>
                              </td>
                              <td className="px-2 py-1.5 text-foreground-muted">
                                {row.maxUnits != null ? row.maxUnits : "—"}
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="email"
                                  value={row.email}
                                  onChange={(e) => setImportRow(gIdx, rIdx, { email: e.target.value })}
                                  className="w-full min-w-[12rem] rounded border border-border-strong px-2 py-1 text-sm focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                                  aria-label={`Email for ${row.name}`}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Dialog.Close asChild>
                    <Button type="button" variant="secondary">Cancel</Button>
                  </Dialog.Close>
                  <Button type="button" onClick={handleImportSubmit} disabled={importLoading}>
                    {importLoading ? "Creating…" : "Create users"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
