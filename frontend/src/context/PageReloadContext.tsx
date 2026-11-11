import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface PageReload {
  /** True while the open page (or something on it) has registered a data loader. */
  available: boolean;
  /** True while the loaders are running. */
  busy: boolean;
  /** Runs every registered loader (the icon in the top bar). */
  reload: () => void;
  /** Bumped on every reload, so parts that fetch inside effects can list it as a dependency. */
  tick: number;
  register: (fn: () => unknown) => () => void;
}

const Ctx = createContext<PageReload | null>(null);

/** Collects the data loaders of whatever is on the open page, so the icon in the top bar reloads that page's data. */
export function PageReloadProvider({ children }: { children: ReactNode }) {
  const handlers = useRef(new Set<() => unknown>());
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const register = useCallback((fn: () => unknown) => {
    handlers.current.add(fn);
    setCount(handlers.current.size);
    return () => {
      handlers.current.delete(fn);
      setCount(handlers.current.size);
    };
  }, []);

  const reload = useCallback(() => {
    const fns = [...handlers.current];
    if (fns.length === 0) return;
    setBusy(true);
    setTick((t) => t + 1);
    // keep the icon turning for a moment even when a loader returns at once
    const minimum = new Promise((r) => setTimeout(r, 500));
    Promise.allSettled([...fns.map((fn) => Promise.resolve().then(fn)), minimum]).finally(() => setBusy(false));
  }, []);

  const value = useMemo(() => ({ available: count > 0, busy, reload, tick, register }), [count, busy, reload, tick, register]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePageReload(): PageReload | null {
  return useContext(Ctx);
}

/** A page calls this with its data loader; the top bar then shows a Reload icon that runs it. The latest function is always used. */
export function useRegisterReload(fn: () => unknown): void {
  const ctx = useContext(Ctx);
  const latest = useRef(fn);
  latest.current = fn;
  const register = ctx?.register;
  useEffect(() => {
    if (!register) return;
    return register(() => latest.current());
  }, [register]);
}

/** For parts that fetch inside effects instead of one loader: a number that changes on each reload, to list as a dependency of those effects. */
export function useReloadTick(): number {
  const ctx = useContext(Ctx);
  const register = ctx?.register;
  useEffect(() => {
    if (!register) return;
    return register(() => undefined);
  }, [register]);
  return ctx?.tick ?? 0;
}
