import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Copy, Link2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { getApiErrorMessage } from "../../types/api";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

type LinkRow = { id: string; label: string; createdAt: string; expiresAt: string | null; lastUsedAt: string | null; status: "active" | "expired" | "revoked" };
type Created = LinkRow & { token: string; pageUrl: string; calendarUrl: string };

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

/**
 * "Share / calendar" for one faculty member's or one class's schedule: makes a read-only link (a page, and a calendar file
 * people can add to Google Calendar, Outlook or their phone). The link always shows the college's Current Semester.
 * Anyone who has the link can see the schedule, so each link can be turned off here.
 */
export function ShareScheduleDialog({ kind, targetId, subject }: { kind: "FACULTY" | "CLASS"; targetId: string; subject: string }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [fresh, setFresh] = useState<Created | null>(null);
  const [days, setDays] = useState("0");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get<LinkRow[]>("/schedule-share", { params: { kind, targetId } });
      setLinks(data);
    } catch {
      setLinks([]);
    }
  }, [kind, targetId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    setFresh(null);
  }, [targetId]);

  const create = async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.post<Created>("/schedule-share", { kind, targetId, ...(Number(days) > 0 ? { expiresInDays: Number(days) } : {}) });
      setFresh(data);
      await load();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not make the link."));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await apiClient.delete(`/schedule-share/${id}`);
      if (fresh?.id === id) setFresh(null);
      toast.success("Link turned off.");
      await load();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not turn off the link."));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied.`);
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  };

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} aria-label={`Share or add to calendar: ${subject}`}>
        <CalendarPlus size={16} className="mr-1.5" aria-hidden />
        Share / calendar
      </Button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Content
          title="Share or add to calendar"
          description={`A read-only link to ${subject} for the Current Semester, with a calendar file for Google Calendar, Outlook or a phone. Anyone with the link can see the schedule: turn a link off when it is no longer needed.`}
          className="!max-w-lg max-h-[90vh] overflow-y-auto"
        >
          <div className="mt-3 flex flex-wrap items-end gap-2 text-sm">
            <label className="flex flex-col gap-1 font-medium text-foreground">
              Link lasts
              <select value={days} onChange={(e) => setDays(e.target.value)} className="rounded border border-border-strong bg-surface px-2 py-1.5 font-normal text-foreground">
                <option value="0">Until I turn it off</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
              </select>
            </label>
            <Button type="button" onClick={() => void create()} disabled={busy}>
              <Link2 size={16} className="mr-1.5" aria-hidden />
              Make a new link
            </Button>
          </div>

          {fresh && (
            <div className="mt-4 space-y-2 rounded border border-border bg-surface-muted/40 p-3 text-sm" role="status">
              <p className="font-medium text-foreground">New link. Copy it now: it is not shown again.</p>
              {[
                { label: "Schedule page", value: fresh.pageUrl },
                { label: "Calendar file (subscribe or import)", value: fresh.calendarUrl },
              ].map((row) => (
                <div key={row.label}>
                  <p className="text-xs text-foreground-muted">{row.label}</p>
                  <div className="flex gap-2">
                    <input readOnly value={row.value} aria-label={row.label} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded border border-border-strong bg-surface px-2 py-1.5 text-xs text-foreground" />
                    <Button type="button" variant="secondary" onClick={() => void copy(row.value, row.label)} aria-label={`Copy ${row.label}`}>
                      <Copy size={14} aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h3 className="mt-5 text-sm font-semibold text-foreground">Links for this schedule</h3>
          {links.length === 0 ? (
            <p className="mt-1 text-sm text-foreground-muted">No active links.</p>
          ) : (
            <ul className="mt-1 divide-y divide-border rounded border border-border text-sm">
              {links.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-foreground">
                      Made {when(l.createdAt)}
                      {l.expiresAt ? ` · ${l.status === "expired" ? "expired" : "ends"} ${when(l.expiresAt)}` : " · no end date"}
                    </p>
                    <p className="text-xs text-foreground-muted">{l.lastUsedAt ? `Last opened ${when(l.lastUsedAt)}` : "Not opened yet"}</p>
                  </div>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void revoke(l.id)} aria-label={`Turn off the link made ${when(l.createdAt)}`}>
                    Turn off
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
}
