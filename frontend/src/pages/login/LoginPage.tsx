import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppDispatch } from "../../store/hooks";
import { setAuth } from "../../store/authSlice";
import { apiClient } from "../../api/apiClient";
import type { LoginResponse } from "../../types/auth";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/dashboard";

  const TEST_PASSWORD = "Test123!";
  const testUsers = [
    { email: "admin@coe.vantage", label: "Admin" },
    { email: "chairman@coe.vantage", label: "Chairman" },
    { email: "dean@coe.vantage", label: "Dean" },
    { email: "faculty1@coe.vantage", label: "Faculty 1" },
    { email: "officer@coe.vantage", label: "Officer" },
  ] as const;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await apiClient.post<LoginResponse>("/auth/login", { email, password });
      dispatch(setAuth({ user: data.user, accessToken: data.accessToken }));
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestUserAndSubmit = async (testEmail: string) => {
    setError("");
    setEmail(testEmail);
    setPassword(TEST_PASSWORD);
    setLoading(true);
    try {
      const { data } = await apiClient.post<LoginResponse>("/auth/login", { email: testEmail, password: TEST_PASSWORD });
      dispatch(setAuth({ user: data.user, accessToken: data.accessToken }));
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted">
      <div className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-lg border border-border">
        <h1 className="mb-4 text-center text-xl font-semibold text-foreground">COE.Vantage</h1>
        <p className="mb-6 text-center text-sm text-foreground-muted">Faculty Load Scheduling</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded border border-border-strong px-3 py-2 text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded border border-border-strong px-3 py-2 text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-primary py-2 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 focus:ring-2 focus:ring-focus-ring focus:ring-offset-2"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="mt-6 pt-4 border-t border-border">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Quick sign in (dev)</p>
            <p className="mb-2 text-xs text-foreground-muted">Password: {TEST_PASSWORD}</p>
            <div className="flex flex-wrap gap-2">
              {testUsers.map(({ email: testEmail, label }) => (
                <button
                  key={testEmail}
                  type="button"
                  onClick={() => handleTestUserAndSubmit(testEmail)}
                  disabled={loading}
                  className="rounded border border-border bg-surface-muted px-2 py-1.5 text-xs font-medium text-foreground hover:bg-surface-hover focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
