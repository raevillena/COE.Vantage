import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
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
import { toast } from "react-hot-toast";
import { GoogleSignIn } from "./GoogleSignIn";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [loading, setLoading] = useState(false);
  const showQuickSignIn = import.meta.env.MODE !== "production";
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/dashboard";

  // If we were redirected here because the session expired, show a one-time toast.
  useEffect(() => {
    try {
      const flag = sessionStorage.getItem("sessionExpired");
      if (flag === "1") {
        sessionStorage.removeItem("sessionExpired");
        toast.error("Your session has expired. Please sign in again.");
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const TEST_PASSWORD = "Test123!";
  const testUsers = [
    { email: "admin@coe.vantage", label: "Admin" },
    { email: "chairman@coe.vantage", label: "Chairman" },
    { email: "dean@coe.vantage", label: "Dean" },
    { email: "secretary@coe.vantage", label: "Secretary" },
    { email: "faculty1@coe.vantage", label: "Faculty 1" },
    { email: "faculty2@coe.vantage", label: "Faculty 2" },
    { email: "faculty3@coe.vantage", label: "Faculty 3" },
    { email: "faculty4@coe.vantage", label: "Faculty 4" },
    { email: "officer@coe.vantage", label: "Officer" },
    { email: "president@coe.vantage", label: "President" },
  ] as const;

  const clearErrors = () => {
    setError("");
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    // Read the inputs themselves: a browser or password manager can autofill without React seeing a change event.
    const form = e.currentTarget as HTMLFormElement;
    const emailValue = (form.elements.namedItem("email") as HTMLInputElement | null)?.value ?? email;
    const passwordValue = (form.elements.namedItem("password") as HTMLInputElement | null)?.value ?? password;
    setEmail(emailValue);
    setPassword(passwordValue);

    const validation = validateLoginFields(emailValue, passwordValue);
    if (validation) {
      setFieldErrors(validation);
      // The message sits under the field; the banner says what to do instead of repeating "fix the errors".
      setError(
        validation.email && validation.password
          ? "Enter your email and password to sign in."
          : validation.email
            ? "Check your email address and try again."
            : "Enter your password to sign in."
      );
      form.querySelector<HTMLInputElement>(validation.email ? "#email" : "#password")?.focus();
      return;
    }

    setLoading(true);
    try {
      const { data } = await apiClient.post<LoginResponse>("/auth/login", {
        email: emailValue.trim(),
        password: passwordValue,
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

  const handleGoogleCredential = async (credential: string) => {
    clearErrors();
    setLoading(true);
    try {
      const { data } = await apiClient.post<LoginResponse>("/auth/google", { credential });
      dispatch(setAuth({ user: data.user, accessToken: data.accessToken }));
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(getLoginError(err).message);
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
    <AuthLayout title="Vantage" subtitle="Versatile Academic Navigator for Timetables and Assignment GEneration" showChangelog>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              name="email"
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
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative mt-1">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
                autoComplete="current-password"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
                className="block w-full rounded border border-border-strong px-3 py-2 pr-10 text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 aria-[invalid=true]:border-danger"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-foreground-muted hover:bg-surface-muted hover:text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 focus:outline-none"
              >
                {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              </button>
            </div>
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

          <GoogleSignIn onCredential={(c) => void handleGoogleCredential(c)} disabled={loading} />

          {showQuickSignIn && (
            <div className="mt-6 pt-4 border-t border-border">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                Quick sign in (dev)
              </p>
              <p className="mb-2 text-xs text-foreground-muted">Password: {TEST_PASSWORD}</p>
              <div className="flex flex-wrap gap-2">
                {testUsers.map(({ email: testEmail, label }) => (
                  <button
                    key={testEmail}
                    type="button"
                    onClick={() => handleTestUserAndSubmit(testEmail)}
                    title={testEmail}
                    disabled={loading}
                    className="rounded border border-border bg-surface-muted px-2 py-1.5 text-xs font-medium text-foreground hover:bg-surface-hover focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
    </AuthLayout>
  );
}
