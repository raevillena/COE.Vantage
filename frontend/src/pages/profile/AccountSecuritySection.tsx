import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { getApiErrorMessage } from "../../types/api";
import { Button } from "../../components/ui/button";

type SessionRow = { id: string; current: boolean; createdAt: string; lastSeenAt: string; ip: string | null; userAgent: string | null };
type EmailPrefs = { digest: boolean; deadlines: boolean };
type LoginRow = { id: string; success: boolean; method: string; ip: string | null; userAgent: string | null; createdAt: string };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** A short "Chrome on Windows" from a user-agent string; falls back to the raw start of it. */
function deviceOf(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/** Where you are signed in (with a way to sign the others out), your recent sign-ins, and the email digest switch. */
export function AccountSecuritySection() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [history, setHistory] = useState<LoginRow[]>([]);
  const [prefs, setPrefs] = useState<EmailPrefs | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, h, d] = await Promise.all([
        apiClient.get<SessionRow[]>("/auth/me/sessions"),
        apiClient.get<LoginRow[]>("/auth/me/login-history"),
        apiClient.get<EmailPrefs>("/auth/me/email-preferences"),
      ]);
      setSessions(s.data);
      setHistory(h.data);
      setPrefs(d.data);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = async (id: string) => {
    setBusy(true);
    try {
      await apiClient.delete(`/auth/me/sessions/${id}`);
      toast.success("Signed out that device.");
      await load();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not sign out that device."));
    } finally {
      setBusy(false);
    }
  };

  const signOutOthers = async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.post<{ ended: number }>("/auth/me/sessions/revoke-others");
      toast.success(data.ended === 0 ? "No other devices were signed in." : `Signed out ${data.ended} other device${data.ended === 1 ? "" : "s"}.`);
      await load();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not sign out the other devices."));
    } finally {
      setBusy(false);
    }
  };

  /** Saves the switches that changed; the screen follows at once and goes back if the server refuses. */
  const changePrefs = async (change: Partial<EmailPrefs>) => {
    const before = prefs;
    setPrefs((p) => (p ? { ...p, ...change } : p));
    try {
      const { data } = await apiClient.patch<EmailPrefs>("/auth/me/email-preferences", change);
      setPrefs(data);
    } catch (e) {
      setPrefs(before);
      toast.error(getApiErrorMessage(e, "Could not save the email setting."));
    }
  };

  return (
    <>
      <section className="mt-8 max-w-xl" aria-label="Email notifications">
        <h2 className="text-lg font-medium text-foreground">Email notifications</h2>
        <label className="mt-2 flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            aria-label="Send me email notifications"
            checked={prefs ? prefs.digest || prefs.deadlines : true}
            disabled={prefs === null}
            onChange={(e) => void changePrefs({ digest: e.target.checked, deadlines: e.target.checked })}
          />
          <span>
            Send me email notifications.
            <span className="block text-xs text-foreground-muted">Turn this off to stop every email from COE Vantage except password resets. Notifications still show in the app.</span>
          </span>
        </label>
        <div className="ml-6 mt-2 space-y-2 border-l border-border pl-4">
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" className="mt-0.5" checked={prefs?.deadlines ?? true} disabled={prefs === null} onChange={(e) => void changePrefs({ deadlines: e.target.checked })} />
            <span>
              Remind me by email about college deadlines.
              <span className="block text-xs text-foreground-muted">Sent on the days the college secretary chose for each deadline.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" className="mt-0.5" checked={prefs?.digest ?? true} disabled={prefs === null} onChange={(e) => void changePrefs({ digest: e.target.checked })} />
            <span>
              Email me a digest of notifications I have not read.
              <span className="block text-xs text-foreground-muted">At most one email a day, and only for notifications still unread after an hour.</span>
            </span>
          </label>
        </div>
      </section>

      <section className="mt-8 max-w-xl" aria-label="Where you are signed in">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-foreground">Where you are signed in</h2>
          <Button type="button" variant="secondary" disabled={busy || !sessions || sessions.length < 2} onClick={() => void signOutOthers()}>
            Sign out other devices
          </Button>
        </div>
        {sessions === null ? (
          <p className="mt-2 text-sm text-foreground-muted">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="mt-2 text-sm text-foreground-muted">No sessions to show.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded border border-border text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {deviceOf(s.userAgent)}
                    {s.current && <span className="ml-2 rounded bg-primary-muted px-1.5 py-0.5 text-xs font-medium text-primary">This device</span>}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {s.ip ?? "unknown address"} · signed in {when(s.createdAt)} · last active {when(s.lastSeenAt)}
                  </p>
                </div>
                {!s.current && (
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void signOut(s.id)} aria-label={`Sign out ${deviceOf(s.userAgent)} from ${s.ip ?? "unknown address"}`}>
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-foreground-muted">A device you sign out stays open for up to 15 more minutes, then has to sign in again.</p>
      </section>

      <section className="mt-8 max-w-xl" aria-label="Recent sign-ins">
        <h2 className="text-lg font-medium text-foreground">Recent sign-ins</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-foreground-muted">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded border border-border text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="text-foreground">
                  {when(h.createdAt)} · {deviceOf(h.userAgent)} · {h.method === "google" ? "Google" : "Password"}
                </span>
                <span className={`shrink-0 text-xs font-medium ${h.success ? "text-foreground-muted" : "text-danger"}`}>{h.success ? "Signed in" : "Failed"}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-foreground-muted">If you see a sign-in you do not recognise, change your password and sign out other devices.</p>
      </section>
    </>
  );
}
