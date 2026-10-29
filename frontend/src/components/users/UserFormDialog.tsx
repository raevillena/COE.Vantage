import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { getApiErrorMessage } from "../../types/api";
import type { Role } from "../../types/auth";
import { HelpTip } from "../ui/helpTip";
import { isTeachingRole } from "../../utils/loadState";

export interface UserFormValues {
  name: string;
  email: string;
  password: string;
  role: Role;
  departmentId: string;
  collegeId: string;
  /** UNIT role: the colleges and areas this viewer may see. */
  unitColleges: string[];
  unitAreas: string[];
  status: string;
  maxUnits: string;
}

export const EMPTY_USER_FORM: UserFormValues = {
  name: "",
  email: "",
  password: "",
  role: "FACULTY",
  departmentId: "",
  collegeId: "",
  unitColleges: [],
  unitAreas: [],
  status: "",
  maxUnits: "18",
};

export interface UserFormPayload {
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
  /** Only sent when the form offers colleges (the admin). The admin and president role have none. */
  collegeId?: string | null;
  unitColleges?: string[];
  unitAreas?: string[];
  status: string | null;
  maxUnits: number | null;
  /** Only present when creating. */
  password?: string;
}

interface UserFormDialogProps {
  mode: "create" | "edit";
  title?: string;
  initial: UserFormValues;
  departments: { id: string; name: string; collegeId?: string | null }[];
  /** Offer a College field (the admin assigns people to colleges). */
  colleges?: { id: string; name: string }[];
  /** Roles the caller may assign. A single role locks the role field. */
  allowedRoles: Role[];
  lockDepartment?: boolean;
  /** Edit mode: make name and email read-only. */
  lockIdentity?: boolean;
  onClose: () => void;
  /** Do the API call; throw on failure (the dialog shows the error and stays open). */
  onSubmit: (payload: UserFormPayload) => Promise<void>;
}

/** What an admin can allow a unit viewer to see inside a college. */
const UNIT_AREA_OPTIONS = [
  { value: "ROOMS", label: "Rooms", hint: "The rooms and when they are used." },
  { value: "SCHEDULES", label: "Schedules", hint: "Dashboard, requests, and the faculty, class and room schedules." },
  { value: "CURRICULUM", label: "Curriculum and classes", hint: "Curriculum, subjects, student classes, departments and the GE sheet." },
  { value: "FACULTY", label: "Faculty", hint: "The faculty list with units, deloading and possible subjects." },
  { value: "REPORTS", label: "Reports", hint: "Schedule and workload reports and exports." },
] as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inputClass =
  "w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 disabled:opacity-60";
const labelClass = "mb-1 block text-sm font-medium text-foreground";

/** "" -> null (no cap); whole number >= 0 -> number; anything else -> undefined (invalid). */
function parseUnits(raw: string): number | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export function UserFormDialog({
  mode,
  title,
  initial,
  departments,
  colleges,
  allowedRoles,
  lockDepartment = false,
  lockIdentity = false,
  onClose,
  onSubmit,
}: UserFormDialogProps) {
  const [form, setForm] = useState<UserFormValues>(initial);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const isCreate = mode === "create";
  const roleLocked = allowedRoles.length === 1;
  const showUnits = isTeachingRole(form.role);
  const isUnit = form.role === "UNIT";
  const spansColleges = form.role === "ADMIN" || form.role === "PRESIDENT" || isUnit;
  const departmentChoices = departments.filter((d) => !form.collegeId || !d.collegeId || d.collegeId === form.collegeId);
  const set = <K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (!email) {
      toast.error("Email is required");
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    if (colleges && !spansColleges && !form.collegeId) {
      toast.error("Choose the college this person belongs to");
      return;
    }
    if (isUnit && form.unitColleges.length === 0) {
      toast.error("Choose at least one college this viewer may see");
      return;
    }
    if (isUnit && form.unitAreas.length === 0) {
      toast.error("Choose at least one area this viewer may see");
      return;
    }
    if (isCreate && form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    const maxUnits = parseUnits(form.maxUnits);
    if (maxUnits === undefined) {
      toast.error("Max units must be 0 or a positive whole number if set (0 = cannot receive any load)");
      return;
    }
    const payload: UserFormPayload = {
      email,
      name,
      role: form.role,
      departmentId: form.departmentId || null,
      ...(colleges ? { collegeId: spansColleges ? null : form.collegeId || null } : {}),
      ...(isUnit ? { unitColleges: form.unitColleges, unitAreas: form.unitAreas } : {}),
      status: form.status.trim() || null,
      maxUnits,
    };
    if (isCreate) payload.password = form.password;

    setSaving(true);
    try {
      await onSubmit(payload);
      onClose();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content title={title ?? (isCreate ? "Add User" : "Edit User")} className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="uf-name" className={labelClass}>Name</label>
            <input id="uf-name" value={form.name} disabled={lockIdentity} onChange={(e) => set("name", e.target.value)} className={inputClass} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="uf-email" className={labelClass}>Email</label>
              {lockIdentity && <span className="mb-1"><HelpTip>Name and email can be changed only by an administrator.</HelpTip></span>}
            </div>
            <input id="uf-email" type="email" value={form.email} disabled={lockIdentity} onChange={(e) => set("email", e.target.value)} className={inputClass} />
          </div>
          {isCreate && (
            <div>
              <div className="flex items-center gap-1.5">
                <label htmlFor="uf-password" className={labelClass}>Initial password</label>
                <span className="mb-1"><HelpTip>Minimum 8 characters. The user can change it later through Forgot password.</HelpTip></span>
              </div>
              <div className="relative">
                <input
                  id="uf-password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  autoComplete="new-password"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-foreground-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </div>
            </div>
          )}
          <div>
            <label className={labelClass}>Role</label>
            <Select.Root value={form.role} onValueChange={(v) => set("role", v as Role)} disabled={roleLocked}>
              <Select.Trigger aria-label="Role">
                <Select.Value placeholder="Role" />
              </Select.Trigger>
              <Select.Content>
                {allowedRoles.map((r) => (
                  <Select.Item key={r} value={r}>{r}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          {isUnit && colleges && (
            <fieldset className="space-y-3 rounded border border-border p-3">
              <legend className="px-1 text-sm font-medium text-foreground">What this viewer can see</legend>
              <div>
                <p className="mb-1 text-xs font-medium text-foreground-muted">Colleges</p>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {colleges.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={form.unitColleges.includes(c.id)}
                        onChange={(e) => set("unitColleges", e.target.checked ? [...form.unitColleges, c.id] : form.unitColleges.filter((x) => x !== c.id))}
                        className="rounded border-border-strong focus:ring-focus-ring"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-foreground-muted">In those colleges</p>
                <div className="space-y-1">
                  {UNIT_AREA_OPTIONS.map((a) => (
                    <label key={a.value} className="flex items-start gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={form.unitAreas.includes(a.value)}
                        onChange={(e) => set("unitAreas", e.target.checked ? [...form.unitAreas, a.value] : form.unitAreas.filter((x) => x !== a.value))}
                        className="mt-0.5 rounded border-border-strong focus:ring-focus-ring"
                      />
                      <span>
                        {a.label}
                        <span className="block text-xs text-foreground-muted">{a.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-foreground-muted">A unit viewer only reads: nothing here can be changed by them.</p>
            </fieldset>
          )}
          {colleges && !spansColleges && (
            <div>
              <label className={labelClass}>College</label>
              <Select.Root value={form.collegeId || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, collegeId: v === "__none__" ? "" : v, departmentId: "" }))}>
                <Select.Trigger aria-label="College">
                  <Select.Value placeholder="Choose a college" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="__none__">Choose a college</Select.Item>
                  {colleges.map((c) => (
                    <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
          )}
          <div>
            <label className={labelClass}>Department</label>
            <Select.Root
              value={form.departmentId || "__none__"}
              onValueChange={(v) => set("departmentId", v === "__none__" ? "" : v)}
              disabled={lockDepartment}
            >
              <Select.Trigger aria-label="Department">
                <Select.Value placeholder="No department" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="__none__">No department</Select.Item>
                {departmentChoices.map((d) => (
                  <Select.Item key={d.id} value={d.id}>{d.name}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          <div>
            <label htmlFor="uf-status" className={labelClass}>Status</label>
            <input
              id="uf-status"
              placeholder="e.g. Full-time, Part-time, On Leave"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className={inputClass}
            />
          </div>
          {showUnits && (
            <div>
              <div className="flex items-center gap-1.5">
                <label htmlFor="uf-max" className={labelClass}>Max units per term</label>
                <span className="mb-1"><HelpTip>Maximum credited units this person can be assigned per semester. Leave blank for no limit; 0 means no load can be assigned.</HelpTip></span>
              </div>
              <input
                id="uf-max"
                type="number"
                min={0}
                placeholder="0 = no load; blank = no cap"
                value={form.maxUnits}
                onChange={(e) => set("maxUnits", e.target.value)}
                className={inputClass}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}