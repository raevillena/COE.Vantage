import { useTheme } from "../../context/ThemeContext";

/**
 * Shared layout for unauthenticated pages (login, reset password).
 * Renders the app banner and optional logo so branding is consistent.
 */
interface AuthLayoutProps {
  children: React.ReactNode;
  /** Optional title shown under the logo in the form card (e.g. "COE.Vantage") */
  title?: string;
  /** Optional short subtitle (e.g. "Faculty Load Scheduling") */
  subtitle?: string;
}

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "v0.0.0";

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  const { preference, resolvedTheme, setPreference } = useTheme();

  const handleCycleTheme = () => {
    const next =
      preference === "light" ? "dark" : preference === "dark" ? "system" : "light";
    setPreference(next);
  };

  const themeLabel =
    preference === "system" ? "System" : preference === "light" ? "Light" : "Dark";
  const themeIcon =
    resolvedTheme === "dark" ? (
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="M21 12.79A9 9 0 0 1 11.21 3 7 7 0 1 0 21 12.79Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ) : (
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M12 3.25V5.5M12 18.5v2.25M5.05 5.05 6.6 6.6M17.4 17.4l1.55 1.55M3.25 12H5.5M18.5 12h2.25M5.05 18.95 6.6 17.4M17.4 6.6 18.95 5.05"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );

  return (
    <div className="auth-bg relative flex min-h-screen flex-col bg-surface-muted md:flex-row">
      {/* Theme toggle: top-right so it's available on login and reset-password */}
      <button
        type="button"
        onClick={handleCycleTheme}
        className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground-muted hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 focus:ring-offset-surface-muted"
        aria-label={`Color theme: ${themeLabel}. Click to change.`}
        title={`Theme: ${themeLabel}`}
      >
        <span aria-hidden className="inline-flex items-center justify-center">
          {themeIcon}
        </span>
        <span>{themeLabel}</span>
      </button>

      {/* Banner: full width on mobile, left panel on desktop; dark variant in dark mode */}
      <div className="flex shrink-0 items-center justify-center border-b border-border bg-surface p-6 md:w-[min(50%,420px)] md:border-b-0 md:border-r">
        <img
          src={resolvedTheme === "dark" ? "/banner-dark.svg" : "/banner.svg"}
          alt="COE.Vantage"
          className="h-auto w-full max-w-sm object-contain md:max-w-full"
        />
      </div>

      {/* Form area: centered card with optional logo + title */}
      <div className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-3">
          <div className="w-full rounded-lg border border-border bg-surface p-6 shadow-lg">
            <div className="mb-6 flex flex-col items-center gap-2">
              <img
                src="/favicon-32x32.png"
                srcSet="/favicon-32x32.png 1x, /android-chrome-192x192.png 2x"
                alt=""
                className="h-10 w-10 shrink-0"
                width={40}
                height={40}
              />
              {title && (
                <h1 className="text-center text-xl font-semibold text-foreground">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-center text-sm text-foreground-muted">
                  {subtitle}
                </p>
              )}
            </div>
            {children}
          </div>
          <p className="text-xs text-foreground-muted">
            COE.Vantage • {APP_VERSION}
          </p>
        </div>
      </div>
    </div>
  );
}
