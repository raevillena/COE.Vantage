import { Link, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { logout } from "../../store/authSlice";
import { apiClient } from "../../api/apiClient";
import { Avatar } from "../ui/avatar";
import { DropdownMenu } from "../ui/dropdownMenu";
import { useTheme } from "../../context/ThemeContext";
interface AppBarProps {
  pageTitle: string;
  onMenuClick?: () => void;
}

export function AppBar({ pageTitle, onMenuClick }: AppBarProps) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const navigate = useNavigate();
   const { preference, resolvedTheme, setPreference } = useTheme();

  const handleLogout = async () => {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      dispatch(logout());
      navigate("/login");
    }
  };

  const handleCycleTheme = () => {
    const next =
      preference === "light" ? "dark" : preference === "dark" ? "system" : "light";
    setPreference(next);
  };

  const themeLabel =
    preference === "system"
      ? "System"
      : preference === "light"
      ? "Light"
      : "Dark";

  const themeIcon =
    resolvedTheme === "dark" ? (
      // Monochrome moon icon (currentColor stroke)
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
      // Monochrome sun icon (currentColor stroke)
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
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-surface px-4 shadow-sm">
      {/* Mobile menu button */}
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-9 w-9 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 md:hidden"
          aria-label="Open menu"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}
      <Link
        to="/dashboard"
        className="flex shrink-0 items-center gap-2 text-lg font-semibold text-foreground"
      >
        <img
          src="/favicon-32x32.png"
          alt=""
          className="h-8 w-8"
          width={32}
          height={32}
        />
        <span>COE.Vantage</span>
      </Link>
      <span className="hidden truncate text-sm font-medium text-foreground-muted sm:block md:ml-4">
        {pageTitle}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={handleCycleTheme}
          className="hidden h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground-muted hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 sm:flex"
          aria-label={`Switch color theme (currently ${themeLabel})`}
        >
          <span aria-hidden className="inline-flex items-center justify-center">
            {themeIcon}
          </span>
          <span>{themeLabel}</span>
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-foreground hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2"
            >
              <Avatar name={user?.name ?? "User"} />
              <span className="hidden max-w-[120px] truncate sm:inline">{user?.name}</span>
              <span className="text-foreground-subtle" aria-hidden>▼</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" className="w-56">
            <div className="px-2 py-1.5 text-xs text-foreground-muted">
              Signed in as <span className="font-medium text-foreground">{user?.name}</span>
            </div>
            <div className="px-2 py-0.5 text-xs text-foreground-muted">{user?.role}</div>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={() => navigate("/dashboard")}>
              Dashboard
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={handleLogout} className="text-danger focus:bg-danger-muted focus:text-danger-hover">
              Log out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
