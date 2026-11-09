/** What a fill promised, kept across the page reload that saving causes so the result can be checked afterwards. */
export interface Job {
  sheetId: string;
  createdAt: number;
  /** "saving": the extension pressed Save; "filled": grades were filled and the person saves themselves. */
  stage: "saving" | "filled";
  expected: { key: string; studentNumber: string; name: string; value: string }[];
  /** Every portal row's grade before the fill, to spot rows that changed without being asked to. */
  before: Record<string, string>;
}

/** Only a "saving" job this fresh is checked automatically on load: the reload after pressing Save is immediate. */
export const AUTO_VERIFY_MS = 2 * 60 * 1000;

/** A job older than this is not trusted any more (it no longer describes what the person just did). */
export const JOB_MAX_AGE_MS = 30 * 60 * 1000;

const keyFor = (sheetId: string) => `vantage-mmsu-job-${sheetId}`;

// chrome.storage.local in the extension; plain localStorage when the script is run outside one.
const hasChromeStorage = () => typeof chrome !== "undefined" && !!chrome?.storage?.local;

export async function saveJob(job: Job): Promise<void> {
  const key = keyFor(job.sheetId);
  if (hasChromeStorage()) await chrome!.storage!.local.set({ [key]: job });
  else localStorage.setItem(key, JSON.stringify(job));
}

export async function loadJob(sheetId: string, now = Date.now()): Promise<Job | null> {
  const key = keyFor(sheetId);
  let job: Job | undefined;
  if (hasChromeStorage()) job = (await chrome!.storage!.local.get(key))[key] as Job | undefined;
  else {
    const raw = localStorage.getItem(key);
    job = raw ? (JSON.parse(raw) as Job) : undefined;
  }
  if (!job || now - job.createdAt > JOB_MAX_AGE_MS) {
    if (job) await clearJob(sheetId);
    return null;
  }
  return job;
}

export async function clearJob(sheetId: string): Promise<void> {
  const key = keyFor(sheetId);
  if (hasChromeStorage()) await chrome!.storage!.local.remove(key);
  else localStorage.removeItem(key);
}
