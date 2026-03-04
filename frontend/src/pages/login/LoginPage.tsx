import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppDispatch } from "../../store/hooks";
import { setAuth } from "../../store/authSlice";
import { apiClient } from "../../api/apiClient";
import type { LoginResponse } from "../../types/auth";
import { AuthLayout } from "../../components/layout/AuthLayout";
import {
  validateLoginFields,
  getLoginError,
  type LoginFieldErrors,
} from "./loginValidation";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
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

  const clearErrors = () => {
    setError("");
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    const validation = validateLoginFields(email, password);
    if (validation) {
      setFieldErrors(validation);
      setError("Please fix the errors below.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await apiClient.post<LoginResponse>("/auth/login", {
        email: email.trim(),
        password,
      });
      dispatch(setAuth({ user: data.user, accessToken: data.accessToken }));
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const { message, fieldErrors: apiFieldErrors } = getLoginError(err);
      setError(message);
      if (apiFieldErrors) setFieldErrors(apiFieldErrors);
    } finally {
      setLoading(false);
    }
  };

  const handleTestUserAndSubmit = async (testEmail: string) => {
    clearErrors();
    setEmail(testEmail);
    setPassword(TEST_PASSWORD);
    setLoading(true);
    try {
      const { data } = await apiClient.post<LoginResponse>("/auth/login", {
        email: testEmail,
        password: TEST_PASSWORD,
      });
      dispatch(setAuth({ user: data.user, accessToken: data.accessToken }));
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const { message, fieldErrors: apiFieldErrors } = getLoginError(err);
      setError(message);
      if (apiFieldErrors) setFieldErrors(apiFieldErrors);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="COE.Vantage" subtitle="Class Load Scheduling">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              autoComplete="email"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              className="mt-1 block w-full rounded border border-border-strong px-3 py-2 text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 aria-[invalid=true]:border-danger"
            />
            {fieldErrors.email && (
              <p id="email-error" className="mt-1 text-sm text-danger" role="alert">
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              autoComplete="current-password"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              className="mt-1 block w-full rounded border border-border-strong px-3 py-2 text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 aria-[invalid=true]:border-danger"
            />
            {fieldErrors.password && (
              <p id="password-error" className="mt-1 text-sm text-danger" role="alert">
                {fieldErrors.password}
              </p>
            )}
          </div>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
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
    </AuthLayout>
  );
}
