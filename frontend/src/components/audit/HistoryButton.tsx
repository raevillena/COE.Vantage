import { History } from "lucide-react";
import { Dialog } from "../ui/dialog";
import { useAppSelector } from "../../store/hooks";
import { AuditList } from "./AuditList";

/** Only these roles may read the history. */
export const AUDIT_ROLES = ["ADMIN", "DEAN", "COLLEGE_SECRETARY"];

interface HistoryButtonProps {
  /** Comma-separated record kinds this page owns, e.g. "SUBJECT". */
  entityType: string;
  /** What the panel is called, e.g. "Subjects". */
  title: string;
}

/** "History" button for a page header. It shows nothing at all to roles that may not read the history. */
export function HistoryButton({ entityType, title }: HistoryButtonProps) {
  const role = useAppSelector((s) => s.auth.user?.role);
  if (!role || !AUDIT_ROLES.includes(role)) return null;
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2"
        >
          <History size={14} aria-hidden />
          History
        </button>
      </Dialog.Trigger>
      <Dialog.Content
        className="!max-w-3xl max-h-[85vh] overflow-y-auto"
        title={`${title} history`}
        description="Who changed what, newest first. Entries cannot be edited or removed, and keep the role each person had at the time."
      >
        <div className="mt-4">
          <AuditList entityType={entityType} />
        </div>
        <div className="mt-5 flex justify-end">
          <Dialog.Close className="rounded border border-border-strong px-3 py-1.5 text-sm text-foreground hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2">
            Close
          </Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
