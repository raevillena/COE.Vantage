import { badRequest } from "./errors.js";

/** Convert a Google Sheets edit/share URL into a CSV export URL (same idea as legacy grade viewer). */
export function toGoogleSheetsCsvExportUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw badRequest("Sheet URL is required");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw badRequest("Invalid sheet URL");
  }

  if (url.hostname !== "docs.google.com") {
    throw badRequest("Only Google Sheets URLs on docs.google.com are supported");
  }

  if (url.pathname.includes("/export") && url.searchParams.get("format") === "csv") {
    return `${url.origin}${url.pathname}${url.search}`;
  }

  const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match?.[1]) {
    throw badRequest("Could not read spreadsheet id from URL. Use a link like https://docs.google.com/spreadsheets/d/…");
  }
  const spreadsheetId = match[1];

  let gid = url.searchParams.get("gid");
  if (!gid && url.hash) {
    const fromHash = url.hash.match(/gid=(\d+)/);
    gid = fromHash?.[1] ?? null;
  }
  const gidParam = gid ?? "0";

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gidParam}`;
}
