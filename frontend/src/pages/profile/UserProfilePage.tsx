import { useEffect, useState } from "react";
import { useAppSelector } from "../../store/hooks";
import { apiClient } from "../../api/apiClient";
import { Select } from "../../components/ui/select";
import { useSchedulePalette, type SchedulePaletteId } from "../../context/SchedulePaletteContext";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  DEAN: "Dean",
  CHAIRMAN: "Chairman",
  FACULTY: "Faculty",
  OFFICER: "Officer",
};

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      await apiClient.post("/auth/request-password-reset", { currentPassword });
      setMessage({
        type: "success",
        text: "Password reset email sent. Check your inbox (or the server console in development if SMTP is not configured).",
      });
      setCurrentPassword("");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Request failed";
      setMessage({ type: "error", text: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded border border-border bg-surface overflow-hidden p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="currentPassword" className="block text-sm font-medium text-foreground">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="mt-1 block w-full max-w-xs rounded border border-border-strong px-3 py-2 text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
          />
        </div>
        {message && (
          <p className={`text-sm ${message.type === "success" ? "text-success" : "text-danger"}`}>
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 focus:ring-2 focus:ring-focus-ring focus:ring-offset-2"
        >
          {loading ? "Sending…" : "Send password reset email"}
        </button>
      </form>
    </div>
  );
}

export function UserProfilePage() {
  const user = useAppSelector((s) => s.auth.user);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const { paletteId, palettes, setPaletteId } = useSchedulePalette();

  useEffect(() => {
    if (!user?.departmentId) return;
    apiClient
      .get<{ id: string; name: string }[]>("/departments")
      .then(({ data }) => {
        const dept = data.find((d) => d.id === user.departmentId);
        setDepartmentName(dept?.name ?? null);
      })
      .catch(() => setDepartmentName(null));
  }, [user?.departmentId]);

  if (!user) {
    return (
      <div className="rounded border border-border bg-surface p-8 text-center">
        <p className="text-foreground-muted">You are not signed in.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-6">Profile</h1>
      <div className="rounded border border-border bg-surface overflow-hidden max-w-xl">
        <dl className="divide-y divide-border">
          <div className="px-4 py-3">
            <dt className="text-sm font-medium text-foreground-muted">Name</dt>
            <dd className="mt-0.5 text-foreground">{user.name}</dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-sm font-medium text-foreground-muted">Email</dt>
            <dd className="mt-0.5 text-foreground">{user.email}</dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-sm font-medium text-foreground-muted">Role</dt>
            <dd className="mt-0.5 text-foreground">{ROLE_LABELS[user.role] ?? user.role}</dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-sm font-medium text-foreground-muted">Department</dt>
            <dd className="mt-0.5 text-foreground">{departmentName ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <section className="mt-8 max-w-xl">
        <h2 className="text-lg font-medium text-foreground mb-3">Change password</h2>
        <p className="text-sm text-foreground-muted mb-4">
          Request a password reset link to your email. You will set the new password yourself; administrators cannot see or set your password.
        </p>
        <ChangePasswordForm />
      </section>

      <section className="mt-8 max-w-xl">
        <h2 className="text-lg font-medium text-foreground mb-3">Schedule color palette</h2>
        <p className="text-sm text-foreground-muted mb-4">
          Choose how subjects are colored in the scheduler. This only affects your view on this device.
        </p>
        <div className="max-w-xs">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Palette
          </label>
          <Select.Root
            value={paletteId}
            onValueChange={(value) => setPaletteId(value as SchedulePaletteId)}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {palettes.map((p) => (
                <Select.Item key={p.id} value={p.id}>
                  {p.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <p className="mt-1 text-xs text-foreground-muted">
            {palettes.find((p) => p.id === paletteId)?.description}
          </p>
        </div>
      </section>

      <p className="mt-6 text-sm text-foreground-muted">
        To change your name or email, contact an administrator.
      </p>
    </div>
  );
}
