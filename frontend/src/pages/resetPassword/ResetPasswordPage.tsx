import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "../../api/apiClient";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!token.trim()) {
      setError("Reset link is invalid or missing. Request a new one from your profile.");
      return;
    }
    setLoading(true);
    try {
      await apiClient.post("/auth/reset-password", { token, newPassword });
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Reset failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <div className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-lg border border-border text-center">
          <p className="text-foreground font-medium">Password updated.</p>
          <p className="mt-2 text-sm text-foreground-muted">Redirecting you to sign in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted">
      <div className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-lg border border-border">
        <h1 className="mb-2 text-center text-xl font-semibold text-foreground">Set new password</h1>
        <p className="mb-6 text-center text-sm text-foreground-muted">
          Enter your new password below. Links expire after 1 hour.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-foreground">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 block w-full rounded border border-border-strong px-3 py-2 text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 block w-full rounded border border-border-strong px-3 py-2 text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="w-full rounded bg-primary py-2 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 focus:ring-2 focus:ring-focus-ring focus:ring-offset-2"
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
        <p className="mt-4 text-center">
          <a href="/login" className="text-sm text-primary hover:underline">
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  );
}
