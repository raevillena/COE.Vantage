import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Image as ImageIcon, RefreshCw } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import { getApiErrorMessage } from "../../types/api";
import { useAppSelector } from "../../store/hooks";
import { Button } from "../../components/ui/button";
import { HelpTip } from "../../components/ui/helpTip";
import { Spinner } from "../../components/ui/spinner";
import { formatBytes } from "../../utils/compressImage";
import { FeedbackDetailDialog } from "./FeedbackDetailDialog";
import { NewFeedbackDialog } from "./NewFeedbackDialog";
import {
  FEEDBACK_PAGES,
  STATUS_BADGE,
  STATUS_LABEL,
  TYPE_BADGE,
  TYPE_LABEL,
  type FeedbackItem,
  type FeedbackStatus,
  type FeedbackStorage,
  type FeedbackType,
} from "./feedbackTypes";

const selectClass =
  "rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1";

/** Housekeeping for admins: pictures are the only part that grows the database, so they can be cleared in bulk. */
function PictureStorage({ onPurged }: { onPurged: () => void }) {
  const [months, setMonths] = useState(6);
  const [closedOnly, setClosedOnly] = useState(true);
  const [stats, setStats] = useState<FeedbackStorage | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get<FeedbackStorage>("/feedback/storage", {
        params: { olderThanMonths: months, closedOnly: String(closedOnly) },
      });
      setStats(data);
    } catch {
      setStats(null);
    }
  }, [months, closedOnly]);

  useEffect(() => {
    setConfirm(false);
    void load();
  }, [load]);

  const purge = async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.delete<{ deleted: number; bytes: number }>("/feedback/images", {
        params: { olderThanMonths: months, closedOnly: String(closedOnly) },
      });
      toast.success(`Deleted ${data.deleted} ${data.deleted === 1 ? "picture" : "pictures"} (${formatBytes(data.bytes)})`);
      setConfirm(false);
      onPurged();
      await load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Could not delete the pictures"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded border border-border bg-surface p-4" aria-label="Picture storage">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">Picture storage</h2>
        <HelpTip>
          Pictures are stored in the database and are the only part of feedback that takes real space. Deleting them keeps the text, status and notes. Postgres reuses the freed space automatically, so the database stops growing even if the file size does not shrink right away.
        </HelpTip>
      </div>
      {stats ? (
        <p className="mt-1 text-sm text-foreground-muted">
          {stats.total.count} {stats.total.count === 1 ? "picture" : "pictures"} using {formatBytes(stats.total.bytes)}.
        </p>
      ) : (
        <p className="mt-1 text-sm text-foreground-muted">Loading…</p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="purge-months" className="mb-1 block text-xs font-medium text-foreground-muted">Older than</label>
          <select id="purge-months" value={months} onChange={(e) => setMonths(Number(e.target.value))} className={selectClass} disabled={busy}>
            {[0, 1, 3, 6, 12].map((m) => (
              <option key={m} value={m}>{m === 0 ? "Any age" : `${m} ${m === 1 ? "month" : "months"}`}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
          <input type="checkbox" checked={closedOnly} onChange={(e) => setClosedOnly(e.target.checked)} disabled={busy} />
          Only Done, Declined or archived
        </label>
        {confirm ? (
          <div className="flex items-center gap-2 pb-0.5">
            <span className="text-sm text-foreground-muted">Delete {stats?.purgeable.count ?? 0} pictures?</span>
            <Button size="sm" variant="danger" onClick={purge} disabled={busy}>{busy ? "Deleting…" : "Yes, delete"}</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>Cancel</Button>
          </div>
        ) : (
          <Button size="sm" variant="dangerOutline" onClick={() => setConfirm(true)} disabled={busy || !stats || stats.purgeable.count === 0}>
            {stats ? `Delete ${stats.purgeable.count} ${stats.purgeable.count === 1 ? "picture" : "pictures"} (${formatBytes(stats.purgeable.bytes)})` : "Delete pictures"}
          </Button>
        )}
      </div>
    </section>
  );
}

export function FeedbackPage() {
  const user = useAppSelector((s) => s.auth.user);
  const isAdmin = user?.role === "ADMIN";
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<FeedbackStatus | "">("");
  const [type, setType] = useState<FeedbackType | "">("");
  const [pageFilter, setPageFilter] = useState("");
  const [archived, setArchived] = useState<"false" | "true" | "all">("false");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [storageKey, setStorageKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params: Record<string, string> = { archived };
      if (status) params.status = status;
      if (type) params.type = type;
      if (pageFilter) params.page = pageFilter;
      if (debouncedQ) params.q = debouncedQ;
      const { data } = await apiClient.get<FeedbackItem[]>("/feedback", { params });
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [status, type, pageFilter, debouncedQ, archived]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<FeedbackStatus, number> = { NEW: 0, PLANNED: 0, DONE: 0, DECLINED: 0 };
    items.forEach((i) => (c[i.status] += 1));
    return c;
  }, [items]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Feedback</h1>
          <HelpTip>
            Tell us what should change: a problem, a change request or an idea, with screenshots. Everyone can read the list, so check whether someone already reported the same thing. Only administrators change the status.
          </HelpTip>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading} aria-label="Reload feedback">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden />
          </Button>
          <Button onClick={() => setCreating(true)}>New feedback</Button>
        </div>
      </div>

      {isAdmin && <PictureStorage key={storageKey} onPurged={() => void load()} />}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="fb-search" className="mb-1 block text-xs font-medium text-foreground-muted">Search</label>
          <input
            id="fb-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title, details or page"
            className={`${selectClass} w-full`}
          />
        </div>
        <div>
          <label htmlFor="fb-f-page" className="mb-1 block text-xs font-medium text-foreground-muted">Page</label>
          <select id="fb-f-page" value={pageFilter} onChange={(e) => setPageFilter(e.target.value)} className={selectClass}>
            <option value="">All pages</option>
            {FEEDBACK_PAGES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fb-f-type" className="mb-1 block text-xs font-medium text-foreground-muted">Kind</label>
          <select id="fb-f-type" value={type} onChange={(e) => setType(e.target.value as FeedbackType | "")} className={selectClass}>
            <option value="">All kinds</option>
            {(Object.keys(TYPE_LABEL) as FeedbackType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fb-f-status" className="mb-1 block text-xs font-medium text-foreground-muted">Status</label>
          <select id="fb-f-status" value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus | "")} className={selectClass}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as FeedbackStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fb-f-arch" className="mb-1 block text-xs font-medium text-foreground-muted">Archive</label>
          <select id="fb-f-arch" value={archived} onChange={(e) => setArchived(e.target.value as "false" | "true" | "all")} className={selectClass}>
            <option value="false">Active</option>
            <option value="true">Archived</option>
            <option value="all">Both</option>
          </select>
        </div>
      </div>

      {!loading && !failed && items.length > 0 && (
        <p className="text-xs text-foreground-muted">
          {items.length} shown: {counts.NEW} new, {counts.PLANNED} planned, {counts.DONE} done, {counts.DECLINED} declined
        </p>
      )}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-10" aria-busy="true">
          <Spinner />
        </div>
      ) : failed ? (
        <p className="rounded border border-border bg-surface px-4 py-6 text-center text-sm text-foreground-muted">
          Feedback could not be loaded. Use the reload button to try again.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded border border-border bg-surface px-4 py-6 text-center text-sm text-foreground-muted">
          Nothing matches. Use New feedback to add the first one.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => setOpenId(it.id)}
                className="block w-full rounded border border-border bg-surface px-4 py-3 text-left hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded px-2 py-0.5 font-medium ${STATUS_BADGE[it.status]}`}>{STATUS_LABEL[it.status]}</span>
                  <span className={`rounded px-2 py-0.5 font-medium ${TYPE_BADGE[it.type]}`}>{TYPE_LABEL[it.type]}</span>
                  <span className="rounded bg-surface-muted px-2 py-0.5 text-foreground-muted">{it.page}</span>
                  {it.archivedAt && <span className="rounded bg-surface-muted px-2 py-0.5 text-foreground-muted">Archived</span>}
                  {it.imageCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-foreground-muted">
                      <ImageIcon size={12} aria-hidden />
                      {it.imageCount}
                    </span>
                  )}
                  <span className="ml-auto text-foreground-muted">
                    {it.user.name}, {new Date(it.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <h2 className="mt-1.5 text-sm font-medium text-foreground">{it.title}</h2>
                <p className="mt-0.5 line-clamp-2 text-sm text-foreground-muted">{it.description}</p>
                {it.adminNote && <p className="mt-1 line-clamp-1 text-xs text-primary">Note: {it.adminNote}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <NewFeedbackDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
            setStorageKey((k) => k + 1);
          }}
        />
      )}
      {openId && (
        <FeedbackDetailDialog
          id={openId}
          isAdmin={isAdmin}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            void load();
            setStorageKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

