import type { ReactNode } from "react";

/** Same look as the other native selects on the list pages. */
export const filterSelectClass =
  "rounded border border-border-strong bg-surface px-2 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1";

export interface FilterOption {
  value: string;
  label: string;
}

/** A labelled dropdown filter: the first choice ("All …", empty value) means the filter is off. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  allLabel: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={filterSelectClass}>
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/**
 * A row of filters with "Showing x of y" and a one-click "Clear filters". Put the page's search box and the
 * FilterSelects inside it as children.
 */
export function ListFilterBar({
  shown,
  total,
  active,
  onClear,
  children,
}: {
  shown: number;
  total: number;
  /** True when any filter or the search is on. */
  active: boolean;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="list-filters">
      {children}
      {active && (
        <button
          type="button"
          onClick={onClear}
          className="rounded text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
        >
          Clear filters
        </button>
      )}
      <span className="text-sm text-foreground-muted" aria-live="polite">
        Showing {shown} of {total}
      </span>
    </div>
  );
}

/** Distinct, sorted dropdown options from a list: `pick` returns [value, label] or null to skip a row. */
export function optionsFrom<T>(rows: T[], pick: (row: T) => [string, string] | null): FilterOption[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const picked = pick(row);
    if (picked && !seen.has(picked[0])) seen.set(picked[0], picked[1]);
  }
  return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
