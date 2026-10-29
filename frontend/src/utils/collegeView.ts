import { useSyncExternalStore } from "react";

/**
 * The college the admin, the president or a unit viewer chose to look at in the sidebar switcher (null = all the colleges
 * they may see). It is sent to the API as X-College-Id so every list shows that college only, and it is remembered per
 * person in this browser.
 */
const KEY = (userId: string) => `cv_view_college_${userId}`;

let current: string | null = null;
let userId: string | null = null;
const listeners = new Set<() => void>();

function readStoredUserId(): string | null {
  try {
    const raw = sessionStorage.getItem("user");
    return raw ? ((JSON.parse(raw) as { id?: string }).id ?? null) : null;
  } catch {
    return null;
  }
}

/** Loads the remembered choice of this person. Called at sign-in and when the app starts. */
export function initViewCollege(id: string | null): void {
  userId = id;
  try {
    current = id ? localStorage.getItem(KEY(id)) || null : null;
  } catch {
    current = null;
  }
  listeners.forEach((l) => l());
}

export function resetViewCollege(): void {
  userId = null;
  current = null;
  listeners.forEach((l) => l());
}

export function getViewCollege(): string | null {
  return current;
}

export function setViewCollege(id: string | null): void {
  if (id === current) return;
  current = id;
  try {
    if (userId) {
      if (id) localStorage.setItem(KEY(userId), id);
      else localStorage.removeItem(KEY(userId));
    }
  } catch {
    // remembering the choice is a convenience
  }
  listeners.forEach((l) => l());
}

export function useViewCollege(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current
  );
}

// the app may start on a signed-in session
initViewCollege(readStoredUserId());
