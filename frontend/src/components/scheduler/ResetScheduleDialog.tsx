import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";

/** Seconds the confirm button stays locked after the dialog opens, so a reset is never one stray click. */
const COUNTDOWN_SECONDS = 3;

interface ResetScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  busy?: boolean;
  /** Name of the student class being reset. */
  className?: string;
  /** e.g. "2026-2027, 1st Sem" */
  termLabel?: string;
  /** Blocks currently scheduled for the class, when known. */
  loadCount?: number;
}

/** Confirmation for removing every block of a class in the selected term. The confirm button unlocks after a short countdown. */
export function ResetScheduleDialog({ open, onOpenChange, onConfirm, busy = false, className, termLabel, loadCount }: ResetScheduleDialogProps) {
  const [left, setLeft] = useState(COUNTDOWN_SECONDS);

  // every time the dialog opens the countdown starts again
  useEffect(() => {
    if (!open) return;
    setLeft(COUNTDOWN_SECONDS);
    const timer = window.setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const locked = left > 0;
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <Dialog.Content title="Reset schedule?" className="max-w-sm">
        <div className="mt-3 flex gap-3">
          <span aria-hidden className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-muted text-danger">
            <TriangleAlert size={18} />
          </span>
          <p className="text-sm leading-relaxed text-foreground-muted">
            This removes{" "}
            <strong className="font-semibold text-foreground">{loadCount != null ? `all ${loadCount} ${loadCount === 1 ? "block" : "blocks"}` : "every block"}</strong>
            {className && (
              <>
                {" "}of <strong className="font-semibold text-foreground">{className}</strong>
              </>
            )}
            {termLabel && <> in {termLabel}</>}. Subjects stay in the list, so you can schedule them again. This cannot be undone.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Dialog.Close asChild>
            <Button type="button" variant="secondary" disabled={busy}>Cancel</Button>
          </Dialog.Close>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={locked || busy} aria-live="polite">
            {busy ? "Resetting…" : locked ? `Reset schedule (${left})` : "Reset schedule"}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
