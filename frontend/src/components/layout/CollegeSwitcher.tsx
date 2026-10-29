import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Layers, Lock, Search } from "lucide-react";
import type { College } from "../../types/api";
import { collegeCode, collegeColor } from "../../utils/collegeColor";

const RECENT_KEY = "cv_recent_colleges";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function CollegeBadge({ college, small = false }: { college: Pick<College, "id" | "name" | "code"> | "all"; small?: boolean }) {
  const size = small ? "h-[22px] w-[22px] rounded-md text-[8.5px]" : "h-8 w-8 rounded-lg text-[11px]";
  if (college === "all") {
    return (
      <span aria-hidden className={`inline-flex shrink-0 items-center justify-center bg-slate-600 text-white ${size}`}>
        <Layers size={small ? 12 : 16} />
      </span>
    );
  }
  return (
    <span aria-hidden style={{ background: collegeColor(college.id) }} className={`inline-flex shrink-0 items-center justify-center font-bold tracking-wide text-white ${size}`}>
      {collegeCode(college)}
    </span>
  );
}

interface CollegeSwitcherProps {
  colleges: College[];
  /** null = every college this person may see. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** True for people who belong to one college: the switcher is a locked label. */
  locked: boolean;
  allLabel?: string;
}

/**
 * The college switcher at the top of the sidebar. The admin, the president and unit viewers pick which college the
 * pages show (or all of them); everyone else sees their own college, locked.
 */
export function CollegeSwitcher({ colleges, value, onChange, locked, allLabel = "All colleges" }: CollegeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(readRecent);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const current = colleges.find((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    window.setTimeout(() => search.current?.focus(), 0);
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (id: string | null) => {
    onChange(id);
    if (id) {
      const next = [id, ...recent.filter((x) => x !== id)].slice(0, 3);
      setRecent(next);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // recents are a convenience
      }
    }
    setOpen(false);
  };

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => colleges.filter((c) => !q || c.name.toLowerCase().includes(q) || collegeCode(c).toLowerCase().includes(q)),
    [colleges, q]
  );
  const recentColleges = !q && colleges.length > 4 ? recent.map((id) => colleges.find((c) => c.id === id)).filter((c): c is College => Boolean(c)) : [];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>("[data-switch-item]") ?? [])];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown" ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
      items[next]?.focus();
    }
    if (e.key === "Enter" && document.activeElement === search.current && items[0]) {
      e.preventDefault();
      items[0].click();
    }
  };

  const label = value === null ? allLabel : current?.name ?? "College";
  const sub = locked ? "Your college" : value === null ? `${colleges.length} ${colleges.length === 1 ? "college" : "colleges"} combined` : "Switch college";
  const row = (id: string | null, name: string, badge: React.ReactNode) => (
    <button
      key={id ?? "all"}
      type="button"
      role="option"
      aria-selected={value === id}
      data-switch-item
      onClick={() => pick(id)}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
    >
      {badge}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {value === id && <Check size={16} className="shrink-0 text-primary" aria-hidden />}
    </button>
  );

  return (
    <div ref={root} className="relative mb-1" onKeyDown={open ? onKeyDown : undefined}>
      <button
        type="button"
        disabled={locked}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={locked ? `Your college: ${label}` : `Switch college, now ${label}`}
        className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-2.5 py-2 text-left transition-colors enabled:hover:border-border-strong enabled:hover:bg-surface-hover disabled:cursor-default disabled:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-focus-ring"
      >
        <CollegeBadge college={value === null || !current ? "all" : current} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{label}</span>
          <span className="block text-xs text-foreground-muted">{sub}</span>
        </span>
        {locked ? <Lock size={16} className="shrink-0 text-foreground-muted" aria-hidden /> : <ChevronsUpDown size={16} className="shrink-0 text-foreground-muted" aria-hidden />}
      </button>

      {open && !locked && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-lg">
          <label className="mb-1 flex h-9 items-center gap-2 rounded-lg border border-border-strong px-2.5 text-foreground-muted focus-within:ring-2 focus-within:ring-focus-ring">
            <Search size={16} aria-hidden />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search colleges…"
              aria-label="Search colleges"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
            />
          </label>
          <div role="listbox" aria-label="Colleges">
            {colleges.length > 1 && (!q || allLabel.toLowerCase().includes(q)) && row(null, allLabel, <CollegeBadge college="all" small />)}
            {recentColleges.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">Recent</p>
                {recentColleges.map((c) => row(c.id, c.name, <CollegeBadge college={c} small />))}
              </>
            )}
            <p className="px-2 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">{q ? "Results" : "Colleges"}</p>
            {matches.length > 0 ? matches.map((c) => row(c.id, c.name, <CollegeBadge college={c} small />)) : <p className="px-2 py-2.5 text-sm text-foreground-muted">No college matches “{query}”.</p>}
          </div>
          <p className="mt-2 border-t border-border px-2 pt-2 text-[11px] text-foreground-muted">↑ ↓ to move · Enter to pick · Esc to close</p>
        </div>
      )}
    </div>
  );
}
