/**
 * Who may use the extension: the person signed in to Vantage in this same browser, if an administrator granted them
 * "MMSU Grade Push" and they switched it on in their Profile. The Vantage server answers; the extension holds no
 * password or token. (This keeps honest people honest: the extension's code runs on the person's own computer, so it
 * cannot stop someone who edits it. It is an access list, not a security boundary.)
 */
export type AccessReason = "signed_out" | "role" | "not_granted" | "not_enabled" | "unreachable";

export type Access =
  | { allowed: true; name: string; email: string; appUrl: string }
  | { allowed: false; reason: AccessReason; name?: string; email?: string; appUrl: string };

declare const __VANTAGE_API_URL__: string;
declare const __VANTAGE_APP_URL__: string;

const API_OVERRIDE_KEY = "vantage-api-url";
const CACHE_KEY = "vantage-mmsu-access";
/** A positive answer is reused this long, so opening many gradesheets does not hit the server each time. */
export const ACCESS_CACHE_MS = 10 * 60 * 1000;

interface ServerAnswer {
  allowed: boolean;
  reason?: string;
  user?: { name: string; email: string };
  appUrl?: string;
}

/** Runs in the background worker (it may call the Vantage server; a web page's script cannot). */
export async function fetchAccess(): Promise<Access> {
  const stored = (await chrome?.storage?.local.get(API_OVERRIDE_KEY))?.[API_OVERRIDE_KEY];
  const api = (typeof stored === "string" && stored ? stored : __VANTAGE_API_URL__).replace(/\/$/, "");
  const fallbackApp = __VANTAGE_APP_URL__;
  try {
    const response = await fetch(`${api}/auth/extension-access/mmsu-grade-push`, { credentials: "include", cache: "no-store" });
    if (!response.ok) return { allowed: false, reason: "unreachable", appUrl: fallbackApp };
    const data = (await response.json()) as ServerAnswer;
    const appUrl = data.appUrl || fallbackApp;
    if (data.allowed && data.user) return { allowed: true, name: data.user.name, email: data.user.email, appUrl };
    const reason = (["signed_out", "role", "not_granted", "not_enabled"] as const).find((r) => r === data.reason) ?? "unreachable";
    return { allowed: false, reason, name: data.user?.name, email: data.user?.email, appUrl };
  } catch {
    return { allowed: false, reason: "unreachable", appUrl: fallbackApp };
  }
}

/** Runs in the page script: asks the background worker, with a short cache for positive answers. */
export async function requestAccess(force = false): Promise<Access> {
  if (!force) {
    const cached = (await chrome?.storage?.local.get(CACHE_KEY))?.[CACHE_KEY] as { at: number; access: Access } | undefined;
    if (cached?.access?.allowed && Date.now() - cached.at < ACCESS_CACHE_MS) return cached.access;
  }
  let access: Access;
  try {
    access = (await chrome?.runtime?.sendMessage({ type: "vantage-check-access" })) as Access;
    if (!access || typeof access.allowed !== "boolean") throw new Error("no answer");
  } catch {
    access = { allowed: false, reason: "unreachable", appUrl: __VANTAGE_APP_URL__ };
  }
  if (access.allowed) await chrome?.storage?.local.set({ [CACHE_KEY]: { at: Date.now(), access } });
  else await chrome?.storage?.local.remove(CACHE_KEY);
  return access;
}

export function describeDenied(access: Extract<Access, { allowed: false }>): { title: string; text: string } {
  switch (access.reason) {
    case "signed_out":
      return { title: "Sign in to Vantage", text: "Sign in to Vantage in this browser, then check again. The grade push only works for people signed in to Vantage." };
    case "not_granted":
      return { title: "No access yet", text: `${access.name ?? "Your account"} has not been given access to MMSU Grade Push. Ask a Vantage administrator to allow it for you (Users, Experimental access).` };
    case "not_enabled":
      return { title: "Turn it on in Vantage", text: "An administrator allowed you to use MMSU Grade Push. Switch it on in your Vantage Profile (Experimental features), then check again." };
    case "role":
      return { title: "Not available for your role", text: "MMSU Grade Push is not available for your Vantage role." };
    default:
      return { title: "Could not reach Vantage", text: "The Vantage server did not answer, so access could not be checked. Check your connection and try again." };
  }
}
