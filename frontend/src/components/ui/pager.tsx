import { useEffect, useMemo, useState } from "react";
import { filterSelectClass } from "./listFilters";

export const PAGE_SIZES = [25, 50, 100, 200] as const;

/**
 * Page controls under a list: "21-40 of 183", Previous / Next and a page size. Search and filters always work on ALL the
 * rows; only the matching rows are split into pages.
 */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  busy = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  busy?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= PAGE_SIZES[0] && pageSize === PAGE_SIZES[0]) return null; // nothing to page through
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const button =
    "rounded border border-border-strong bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1";
  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-foreground-muted" aria-label="Pages" data-testid="pager">
      <span aria-live="polite">
        {first}–{last} of {total}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          Per page
          <select aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className={filterSelectClass}>
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <button type="button" className={button} disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button type="button" className={button} disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}

/**
 * Client-side paging of a list that is already loaded and filtered. `resetKey` changes whenever the search or a filter
 * changes, which sends the list back to page 1.
 */
export function usePaging<T>(rows: T[], resetKey: string, initialSize = 50) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  useEffect(() => setPage(1), [resetKey, pageSize]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const pageRows = useMemo(() => rows.slice((current - 1) * pageSize, current * pageSize), [rows, current, pageSize]);
  return { pageRows, page: current, pageSize, total: rows.length, setPage, setPageSize };
}
