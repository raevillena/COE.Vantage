import { useCallback, useEffect, useMemo, useState } from "react";
import { PageReloadButton } from "../../components/ui/pageReloadButton";
import { useRegisterReload } from "../../context/PageReloadContext";
import { BellRing, Pencil, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { getApiErrorMessage } from "../../types/api";
import { useAppSelector } from "../../store/hooks";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Spinner } from "../../components/ui/spinner";

export type CollegeDeadline = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string;
  audienceRoles: string[];
  reminderDays: number[];
  reminderHour: number;
  remindersSent: number[];
};

const AUDIENCE: { role: string; label: string }[] = [
  { role: "DEAN", label: "Dean" },
  { role: "CHAIRMAN", label: "Chairmen" },
  { role: "FACULTY", label: "Faculty" },
  { role: "OFFICER", label: "Officers" },
  { role: "COLLEGE_SECRETARY", label: "College secretary" },
];
const REMINDER_CHOICES = [14, 7, 3, 1, 0];
const DEFAULT_REMINDERS = [7, 3, 1];
const DEFAULT_HOUR = 8;

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
const reminderLabel = (d: number) => (d === 0 ? "On the due day" : d === 1 ? "1 day before" : `${d} days before`);

/** Whole calendar days from today to the due day (negative = overdue). */
export function daysLeft(dueAt: string, now = new Date()): number {
  const day = (d: Date) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
  return day(new Date(dueAt)) - day(now);
}

export function deadlineWhen(dueAt: string): string {
  return new Date(dueAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
}

export function DaysLeftBadge({ dueAt }: { dueAt: string }) {
  const n = daysLeft(dueAt);
  const overdue = new Date(dueAt).getTime() < Date.now();
  const tone = overdue ? "bg-surface-muted text-foreground-muted" : n <= 1 ? "bg-danger/15 text-danger" : n <= 3 ? "bg-warning-muted text-warning" : "bg-primary-muted text-primary";
  const text = overdue ? "Passed" : n <= 0 ? "Due today" : n === 1 ? "Due tomorrow" : `${n} days left`;
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${tone}`}>{text}</span>;
}

/** The date-time input wants "YYYY-MM-DDTHH:mm" in the local time zone. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

type Draft = { id: string | null; title: string; description: string; due: string; everyone: boolean; roles: string[]; reminderDays: number[]; reminderHour: number };
const blank = (): Draft => ({ id: null, title: "", description: "", due: "", everyone: true, roles: [], reminderDays: DEFAULT_REMINDERS, reminderHour: DEFAULT_HOUR });

/** College deadlines: everyone in the college reads them; the college secretary adds them and chooses the email reminders. */
export function DeadlinesPage() {
  const role = useAppSelector((s) => s.auth.user?.role);
  const canEdit = role === "COLLEGE_SECRETARY" || role === "ADMIN";
  const [items, setItems] = useState<CollegeDeadline[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CollegeDeadline | null>(null);

  useRegisterReload(() => load());
  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get<CollegeDeadline[]>("/college-deadlines");
      setItems(data);
    } catch {
      setItems([]);
      toast.error("Could not load the deadlines.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const all = items ?? [];
    return { upcoming: all.filter((d) => new Date(d.dueAt).getTime() >= now), past: all.filter((d) => new Date(d.dueAt).getTime() < now).reverse() };
  }, [items]);

  const edit = (d: CollegeDeadline) =>
    setDraft({ id: d.id, title: d.title, description: d.description ?? "", due: toLocalInput(d.dueAt), everyone: d.audienceRoles.length === 0, roles: d.audienceRoles, reminderDays: d.reminderDays, reminderHour: d.reminderHour });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!draft.title.trim()) return void toast.error("Give the deadline a title.");
    if (!draft.due) return void toast.error("Pick the due date and time.");
    if (!draft.everyone && draft.roles.length === 0) return void toast.error("Pick who it is for, or choose everyone.");
    setSaving(true);
    try {
      const body = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        dueAt: new Date(draft.due).toISOString(),
        audienceRoles: draft.everyone ? [] : draft.roles,
        reminderDays: draft.reminderDays,
        reminderHour: draft.reminderHour,
      };
      if (draft.id) await apiClient.patch(`/college-deadlines/${draft.id}`, body);
      else await apiClient.post("/college-deadlines", body);
      toast.success(draft.id ? "Deadline updated." : "Deadline added.");
      setDraft(null);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not save the deadline."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await apiClient.delete(`/college-deadlines/${confirmDelete.id}`);
      toast.success("Deadline removed.");
      setConfirmDelete(null);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not remove the deadline."));
    }
  };

  const card = (d: CollegeDeadline, isPast: boolean) => (
    <li key={d.id} className={`rounded border border-border bg-surface p-3 ${isPast ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{d.title}</p>
          <p className="text-sm text-foreground-muted">{deadlineWhen(d.dueAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <DaysLeftBadge dueAt={d.dueAt} />
          {canEdit && (
            <>
              <Button type="button" variant="secondary" onClick={() => edit(d)} aria-label={`Edit ${d.title}`}>
                <Pencil size={14} aria-hidden />
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirmDelete(d)} aria-label={`Remove ${d.title}`}>
                <Trash2 size={14} aria-hidden />
              </Button>
            </>
          )}
        </div>
      </div>
      {d.description && <p className="mt-2 whitespace-pre-line text-sm text-foreground">{d.description}</p>}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
        <span>For {d.audienceRoles.length === 0 ? "everyone in the college" : d.audienceRoles.map((r) => AUDIENCE.find((a) => a.role === r)?.label ?? r).join(", ")}</span>
        {canEdit && (
          <span className="inline-flex items-center gap-1">
            <BellRing size={12} aria-hidden />
            {d.reminderDays.length === 0 ? "No email reminders" : `Reminds ${d.reminderDays.map((n) => (n === 0 ? "on the day" : `${n}d before`)).join(", ")} at ${hourLabel(d.reminderHour)}`}
          </span>
        )}
      </p>
    </li>
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl font-semibold text-foreground">Deadlines</h1><PageReloadButton /></div>
          <p className="text-sm text-foreground-muted">College deadlines. You get a reminder in the app and by email before each one.</p>
        </div>
        {canEdit && (
          <Button type="button" onClick={() => setDraft(blank())}>
            <Plus size={16} className="mr-1.5" aria-hidden />
            Add deadline
          </Button>
        )}
      </div>

      {items === null ? (
        <div className="flex justify-center py-10" aria-busy="true">
          <Spinner />
        </div>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">Upcoming</h2>
          {upcoming.length === 0 ? <p className="mb-6 text-sm text-foreground-muted">No upcoming deadlines.</p> : <ul className="mb-6 space-y-2">{upcoming.map((d) => card(d, false))}</ul>}
          {past.length > 0 && (
            <details>
              <summary className="mb-2 cursor-pointer text-sm font-semibold uppercase tracking-wide text-foreground-muted">Recently passed ({past.length})</summary>
              <ul className="space-y-2">{past.map((d) => card(d, true))}</ul>
            </details>
          )}
        </>
      )}

      <Dialog.Root open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <Dialog.Content title={draft?.id ? "Edit deadline" : "Add deadline"} description="Everyone it is for sees it here and in their notifications. Reminder emails go out at the hour you choose (Philippine time)." className="!max-w-lg max-h-[90vh] overflow-y-auto">
          {draft && (
            <form className="mt-3 space-y-3 text-sm" onSubmit={save}>
              <label className="flex flex-col gap-1 font-medium text-foreground">
                Title
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={200} autoFocus className="rounded border border-border-strong bg-surface px-3 py-2 font-normal text-foreground" />
              </label>
              <label className="flex flex-col gap-1 font-medium text-foreground">
                Details (optional)
                <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={2000} rows={3} className="rounded border border-border-strong bg-surface px-3 py-2 font-normal text-foreground" />
              </label>
              <label className="flex flex-col gap-1 font-medium text-foreground">
                Due date and time
                <input type="datetime-local" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} className="rounded border border-border-strong bg-surface px-3 py-2 font-normal text-foreground" />
              </label>

              <fieldset className="rounded border border-border p-3">
                <legend className="px-1 text-xs font-medium text-foreground-muted">Who it is for</legend>
                <label className="flex items-center gap-2 text-foreground">
                  <input type="checkbox" checked={draft.everyone} onChange={(e) => setDraft({ ...draft, everyone: e.target.checked })} />
                  Everyone in the college
                </label>
                {!draft.everyone && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {AUDIENCE.map((a) => (
                      <label key={a.role} className="flex items-center gap-1.5 text-foreground">
                        <input type="checkbox" checked={draft.roles.includes(a.role)} onChange={(e) => setDraft({ ...draft, roles: e.target.checked ? [...draft.roles, a.role] : draft.roles.filter((r) => r !== a.role) })} />
                        {a.label}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              <fieldset className="rounded border border-border p-3">
                <legend className="px-1 text-xs font-medium text-foreground-muted">Email reminders</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {REMINDER_CHOICES.map((n) => (
                    <label key={n} className="flex items-center gap-1.5 text-foreground">
                      <input
                        type="checkbox"
                        checked={draft.reminderDays.includes(n)}
                        onChange={(e) => setDraft({ ...draft, reminderDays: e.target.checked ? [...draft.reminderDays, n].sort((a, b) => b - a) : draft.reminderDays.filter((d) => d !== n) })}
                      />
                      {reminderLabel(n)}
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-foreground">
                  <label htmlFor="reminder-hour">Send at</label>
                  <select id="reminder-hour" value={draft.reminderHour} onChange={(e) => setDraft({ ...draft, reminderHour: Number(e.target.value) })} className="rounded border border-border-strong bg-surface px-2 py-1.5">
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => setDraft({ ...draft, reminderDays: DEFAULT_REMINDERS, reminderHour: DEFAULT_HOUR })}>
                    Use the defaults (7, 3 and 1 day before, 8:00 AM)
                  </button>
                </div>
                <p className="mt-2 text-xs text-foreground-muted">A reminder whose time has already passed is skipped. People can turn the emails off on their Profile page; the in-app reminder stays.</p>
              </fieldset>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {draft.id ? "Save changes" : "Add deadline"}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <Dialog.Content title="Remove deadline" description={confirmDelete ? `"${confirmDelete.title}" will be removed for everyone, and its reminders will not be sent.` : ""} className="!max-w-md">
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void remove()}>
              Remove
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
