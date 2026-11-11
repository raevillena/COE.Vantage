import { RefreshCw } from "lucide-react";
import { usePageReload } from "../../context/PageReloadContext";

/** Icon-only Reload for a page header, beside the title (and History). Shows only when the open page has data to reload. */
export function PageReloadButton() {
  const reload = usePageReload();
  if (!reload?.available) return null;
  return (
    <button
      type="button"
      onClick={reload.reload}
      disabled={reload.busy}
      className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-border text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 disabled:opacity-60"
      aria-label="Reload page data"
      title="Reload page data"
      data-testid="page-reload"
    >
      <RefreshCw size={14} className={reload.busy ? "animate-spin" : ""} aria-hidden />
    </button>
  );
}
