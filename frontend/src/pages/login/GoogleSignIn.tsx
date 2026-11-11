import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../api/apiClient";

type GoogleConfig = { enabled: boolean; clientId: string | null; domain: string };

type GoogleId = {
  initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void; hd?: string }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? Object.assign(document.createElement("script"), { src: SCRIPT_SRC, async: true, defer: true });
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Google script blocked")));
    if (!existing) document.head.appendChild(script);
  });
}

/**
 * "Sign in with Google" for accounts that already exist with an @<domain> email (the server decides: it checks the Google
 * token, the domain and that the account exists). Renders nothing when the server has no Google client id configured.
 */
export function GoogleSignIn({ onCredential, disabled }: { onCredential: (credential: string) => void; disabled?: boolean }) {
  const [config, setConfig] = useState<GoogleConfig | null>(null);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const latest = useRef(onCredential);
  latest.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<GoogleConfig>("/auth/google/config")
      .then((res) => !cancelled && setConfig(res.data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!config?.enabled || !config.clientId) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !holder.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: config.clientId!,
          hd: config.domain,
          callback: (response) => response.credential && latest.current(response.credential),
        });
        window.google.accounts.id.renderButton(holder.current, { theme: "outline", size: "large", text: "signin_with", shape: "rectangular", width: 320 });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [config]);

  if (!config?.enabled) return null;
  return (
    <div className="mt-4" aria-busy={disabled}>
      <div className="mb-3 flex items-center gap-3 text-xs text-foreground-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className={`flex justify-center ${disabled ? "pointer-events-none opacity-60" : ""}`} ref={holder} />
      {failed && <p className="text-center text-xs text-foreground-muted">Google sign-in could not load. Use your email and password.</p>}
      <p className="mt-2 text-center text-xs text-foreground-muted">Only for existing accounts with an @{config.domain} email.</p>
    </div>
  );
}
