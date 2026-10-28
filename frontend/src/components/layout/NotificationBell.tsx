import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../api/apiClient";
import { CHANGELOG } from "../../data/changelog";
import { DropdownMenu } from "../ui/dropdownMenu";
import { ChangelogDialog } from "./ChangelogDialog";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  count: number;
  readAt: string | null;
  updatedAt: string;
}

interface NotificationList {
  items: NotificationItem[];
  unread: number;
  lastSeenVersion: string | null;
}

const POLL_MS = 60_000;
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "v0.0.0";

/** "v0.4.1" -> [0, 4, 1] */
function versionParts(v: string): number[] {
  return v.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
}

function isNewer(a: string, b: string): boolean {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Date(iso).toLocaleDateString();
}

/**
 * Bell in the app bar: changes that concern the signed-in user, plus releases they have not looked at yet.
 * It refreshes every minute and when the tab becomes visible again.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const [data, setData] = useState<NotificationList | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const { data: d } = await apiClient.get<NotificationList>("/notifications", { params: { limit: 30 } });
      if (alive.current) setData(d);
    } catch {
      // the bell is a convenience: stay quiet when the server is unreachable
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  /** Releases newer than the last one the user looked at. A user who never looked sees only the latest. */
  const newReleases = useMemo(() => {
    if (!data) return [];
    const seen = data.lastSeenVersion;
    return seen ? CHANGELOG.filter((r) => isNewer(r.version, seen)) : CHANGELOG.slice(0, 1);
  }, [data]);

  const unread = (data?.unread ?? 0) + newReleases.length;

  const openItem = (item: NotificationItem) => {
    if (!item.readAt) {
      setData((d) => (d ? { ...d, unread: Math.max(0, d.unread - 1), items: d.items.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i)) } : d));
      void apiClient.post(`/notifications/${item.id}/read`).catch(() => undefined);
    }
    if (item.link) navigate(item.link);
  };

  const openReleaseNotes = () => {
    const latest = newReleases[0]?.version;
    setNotesOpen(true);
    if (latest) {
      setData((d) => (d ? { ...d, lastSeenVersion: latest } : d));
      void apiClient.post("/notifications/seen-version", { version: latest }).catch(() => undefined);
    }
  };

  const markAllRead = async () => {
    const latest = newReleases[0]?.version;
    setData((d) => (d ? { ...d, unread: 0, lastSeenVersion: latest ?? d.lastSeenVersion, items: d.items.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) } : d));
    await Promise.all([
      apiClient.post("/notifications/read-all").catch(() => undefined),
      latest ? apiClient.post("/notifications/seen-version", { version: latest }).catch(() => undefined) : Promise.resolve(),
    ]);
  };

  const isEmpty = (data?.items.length ?? 0) === 0 && newReleases.length === 0;

  return (
    <>
      <DropdownMenu.Root onOpenChange={(open) => open && void load()}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9a6 6 0 1 1 12 0c0 4.5 2 6 2 6H4s2-1.5 2-6Z" />
              <path d="M10 19a2 2 0 0 0 4 0" />
            </svg>
            {unread > 0 && (
              <span
                data-testid="notification-badge"
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unread === 0}
              className="rounded text-xs font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring disabled:cursor-default disabled:text-foreground-subtle disabled:no-underline"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-1">
            {isEmpty && <p className="px-3 py-6 text-center text-sm text-foreground-muted">Nothing new. Changes to your schedule, requests and feedback show up here.</p>}
            {newReleases.length > 0 && (
              <DropdownMenu.Item onSelect={openReleaseNotes} className="flex-col items-start gap-0.5 bg-primary-muted/40">
                <span className="flex w-full items-center gap-2 font-medium">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                  {newReleases[0].version} is out: {newReleases[0].title}
                </span>
                <span className="pl-4 text-xs text-foreground-muted">
                  {newReleases.length > 1 ? `${newReleases.length} new releases. ` : ""}See what&apos;s new.
                </span>
              </DropdownMenu.Item>
            )}
            {data?.items.map((item) => (
              <DropdownMenu.Item key={item.id} onSelect={() => openItem(item)} className="flex-col items-start gap-0.5">
                <span className={`flex w-full items-center gap-2 ${item.readAt ? "text-foreground-muted" : "font-medium"}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-primary"}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="shrink-0 text-[11px] font-normal text-foreground-subtle">{timeAgo(item.updatedAt)}</span>
                </span>
                {item.body && <span className="line-clamp-2 pl-4 text-xs text-foreground-muted">{item.body}</span>}
              </DropdownMenu.Item>
            ))}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <ChangelogDialog currentVersion={APP_VERSION} open={notesOpen} onOpenChange={setNotesOpen} showTrigger={false} />
    </>
  );
}
