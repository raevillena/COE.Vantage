/**
 * A full, shareable address for an API path (for links people copy or open outside the app, such as a calendar file).
 * Production serves the API on its own address (VITE_API_URL); locally it is the "/api" path of the same site.
 */
export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL ?? "/api";
  const root = /^https?:\/\//.test(base) ? base : `${window.location.origin}${base.startsWith("/") ? "" : "/"}${base}`;
  return `${root.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}
