import { Dialog } from "../ui/dialog";
import { CHANGELOG, type ChangeKind } from "../../data/changelog";

const KIND_LABEL: Record<ChangeKind, string> = { new: "New", improved: "Improved", fixed: "Fixed" };
const KIND_TONE: Record<ChangeKind, string> = {
  new: "bg-success-muted text-success",
  improved: "bg-surface-muted text-foreground-muted",
  fixed: "bg-warning-muted text-warning",
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** "What's new" link that opens the release notes. Works signed out (login / reset pages). */
export function ChangelogDialog({ currentVersion }: { currentVersion: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="rounded text-xs font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 focus:ring-offset-surface-muted"
        >
          What&apos;s new
        </button>
      </Dialog.Trigger>
      <Dialog.Content
        className="!max-w-lg max-h-[85vh] overflow-y-auto"
        title="What's new"
        description={`You are on ${currentVersion}. Newest changes first.`}
      >
        <div className="mt-4 space-y-6">
          {CHANGELOG.map((release) => (
            <section key={release.version} aria-labelledby={`rel-${release.version}`}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 id={`rel-${release.version}`} className="font-semibold text-foreground">
                  {release.version}
                </h3>
                <span className="text-xs text-foreground-muted">{formatDate(release.date)}</span>
                {release.version === currentVersion && (
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-foreground-muted">current</span>
                )}
              </div>
              <p className="text-sm text-foreground-muted">{release.title}</p>
              <ul className="mt-2 space-y-1.5">
                {release.changes.map((c, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground">
                    <span className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_TONE[c.kind]}`}>
                      {KIND_LABEL[c.kind]}
                    </span>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Dialog.Close className="rounded border border-border-strong px-3 py-1.5 text-sm text-foreground hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2">
            Close
          </Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
