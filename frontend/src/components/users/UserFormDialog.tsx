import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { getApiErrorMessage } from "../../types/api";
import type { Role } from "../../types/auth";

export interface UserFormValues {
  name: string;
  email: string;
  password: string;
  role: Role;
  departmentId: string;
  status: string;
  maxUnits: string;
}

export const EMPTY_USER_FORM: UserFormValues = {
  name: "",
  email: "",
  password: "",
  role: "FACULTY",
  departmentId: "",
  status: "",
  maxUnits: "18",
};

export interface UserFormPayload {
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
  status: string | null;
  maxUnits: number | null;
  /** Only present when creating. */
  password?: string;
}

interface UserFormDialogProps {
  mode: "create" | "edit";
  title?: string;
  initial: UserFormValues;
  departments: { id: string; name: string }[];
  /** Roles the caller may assign. A single role locks the role field. */
  allowedRoles: Role[];
  lockDepartment?: boolean;
  /** Edit mode: make name and email read-only. */
  lockIdentity?: boolean;
  onClose: () => void;
  /** Do the API call; throw on failure (the dialog shows the error and stays open). */
  onSubmit: (payload: UserFormPayload) => Promise<void>;
}

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
  const showUnits = form.role === "FACULTY" || form.role === "CHAIRMAN";
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
            <label htmlFor="uf-email" className={labelClass}>Email</label>
            <input id="uf-email" type="email" value={form.email} disabled={lockIdentity} onChange={(e) => set("email", e.target.value)} className={inputClass} />
            {lockIdentity && (
              <p className="mt-0.5 text-xs text-foreground-muted">Name and email can only be changed by an administrator.</p>
            )}
          </div>
          {isCreate && (
            <div>
              <label htmlFor="uf-password" className={labelClass}>Initial password</label>
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
              <p className="mt-0.5 text-xs text-foreground-muted">At least 8 characters. The user can change it with Forgot password.</p>
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
                {departments.map((d) => (
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
              <label htmlFor="uf-max" className={labelClass}>Max units per term</label>
              <input
                id="uf-max"
                type="number"
                min={0}
                placeholder="0 = no load; blank = no cap"
                value={form.maxUnits}
                onChange={(e) => set("maxUnits", e.target.value)}
                className={inputClass}
              />
              <p className="mt-0.5 text-xs text-foreground-muted">
                Caps how many units can be assigned per semester (0 = cannot receive any load, blank = no cap).
              </p>
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