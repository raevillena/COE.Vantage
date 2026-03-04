import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** What the user chose: light, dark, or \"follow system\". */
  preference: ThemePreference;
  /** What is actually applied right now after resolving system preference. */
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getInitialPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  // \"system\" – follow OS-level prefers-color-scheme
  const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
  return mql && mql.matches ? "dark" : "light";
}

function applyThemeClass(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getInitialPreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getInitialPreference()));

  // Keep DOM class and state in sync whenever the preference changes.
  useEffect(() => {
    const nextResolved = resolveTheme(preference);
    setResolvedTheme(nextResolved);
    applyThemeClass(nextResolved);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("theme", preference);
    }
  }, [preference]);

  // When following system, react to OS theme changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;

    const handleChange = (event: MediaQueryListEvent) => {
      setResolvedTheme((current) => {
        // Only update when the user is following system.
        if (preference !== "system") return current;
        const next: ResolvedTheme = event.matches ? "dark" : "light";
        applyThemeClass(next);
        return next;
      });
    };

    // Use modern or legacy listener API depending on browser support.
    if (mql.addEventListener) {
      mql.addEventListener("change", handleChange);
    } else {
      // eslint-disable-next-line deprecation/deprecation
      mql.addListener(handleChange);
    }

    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener("change", handleChange);
      } else {
        // eslint-disable-next-line deprecation/deprecation
        mql.removeListener(handleChange);
      }
    };
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
  }, []);

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      setPreference,
    }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

