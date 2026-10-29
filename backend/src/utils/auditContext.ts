import { AsyncLocalStorage } from "node:async_hooks";

/** The signed-in person behind a request, as they are at that moment. Copied into every audit entry. */
export interface AuditActor {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  /** The college the person belongs to; null for the admin and the president, who span colleges. */
  collegeId: string | null;
}

interface Store {
  actor: AuditActor;
  /** When set, the college scope is switched off for the work inside (see collegeScope.ts). */
  unscoped?: boolean;
}

const store = new AsyncLocalStorage<Store>();

/** Runs the rest of a request with this person as the actor of any audit entry and the college of any query. */
export function runWithActor<T>(actor: AuditActor, fn: () => T): T {
  return store.run({ actor }, fn);
}

export function currentActor(): AuditActor | undefined {
  return store.getStore()?.actor;
}

/** True while inside `runUnscoped`. */
export function isUnscoped(): boolean {
  return store.getStore()?.unscoped === true;
}

/**
 * Runs `fn` without the automatic college filter, for the few things that must look across colleges (finding the
 * system admins to notify, reading a record's college). The actor stays the same.
 */
export function runUnscoped<T>(fn: () => T): T {
  const current = store.getStore();
  if (!current) return fn();
  return store.run({ ...current, unscoped: true }, fn);
}
