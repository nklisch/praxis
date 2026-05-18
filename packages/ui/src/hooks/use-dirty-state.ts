import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { DirtyStateContext } from "../contexts/dirty-state-provider.js";

/**
 * Register a named surface with the nearest `<DirtyStateProvider>` and get
 * back imperative controls to mark it dirty or clean.
 *
 * The key is cleared from the provider on unmount — callers never leak stale
 * dirty entries when a surface is removed from the tree.
 *
 * @param key - A stable identifier for this surface (e.g. "configure.course").
 */
export function useDirtyState(key: string): {
  isDirty: boolean;
  markDirty: () => void;
  markClean: () => void;
} {
  const ctx = useContext(DirtyStateContext);
  if (!ctx) {
    throw new Error("useDirtyState must be used inside <DirtyStateProvider>");
  }

  const { setDirty, clearDirty, subscribe } = ctx;

  // Local mirror so this component re-renders when the key's state changes.
  const [isDirty, setIsDirty] = useState(false);

  // Stable key ref — if the caller ever changes `key` we'll clear the old one.
  const prevKeyRef = useRef<string | null>(null);

  // Subscribe to changes for this key so the local mirror stays in sync.
  useEffect(() => {
    // Clear previous key if it changed
    if (prevKeyRef.current !== null && prevKeyRef.current !== key) {
      clearDirty(prevKeyRef.current);
      setIsDirty(false);
    }
    prevKeyRef.current = key;

    const unsubscribe = subscribe(key, (dirty) => setIsDirty(dirty));

    return () => {
      unsubscribe();
      // Clear from provider on unmount so stale keys don't pollute the aggregate.
      clearDirty(key);
    };
  }, [key, clearDirty, subscribe]);

  const markDirty = useCallback(() => setDirty(key), [key, setDirty]);
  const markClean = useCallback(() => clearDirty(key), [key, clearDirty]);

  return { isDirty, markDirty, markClean };
}

/**
 * Observe the dirty state of a named key without owning it.
 *
 * Unlike `useDirtyState`, this hook does NOT call `clearDirty` on unmount.
 * Use this in observer components (e.g. tab buttons that display change-dots)
 * that need to *read* a key's dirty state without being the authoritative owner.
 *
 * The owning component (the surface that registers the key via `useDirtyState`)
 * is responsible for clearing on unmount.
 *
 * @param key - A stable identifier for the surface to observe (e.g. "configure.course").
 */
export function useDirtyStateObserver(key: string): { isDirty: boolean } {
  const ctx = useContext(DirtyStateContext);
  if (!ctx) {
    throw new Error("useDirtyStateObserver must be used inside <DirtyStateProvider>");
  }

  const { subscribe } = ctx;

  // Start false; subscription pushes true/false on every state change.
  // We accept the limitation: if the key was dirty before this component mounts
  // (rare for the configure tab-strip use case), the dot won't show until the next
  // state change. For the tab-strip this is fine — the dirty state is driven by
  // user interaction after the surface mounts.
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribe(key, (dirty) => setIsDirty(dirty));
    return unsubscribe;
    // key is stable per tab; subscribe is stable (useCallback in provider)
  }, [key, subscribe]);

  return { isDirty };
}

/**
 * Read the aggregate dirty state from the nearest `<DirtyStateProvider>`.
 *
 * - `dirtyCount` — total number of currently-dirty keys (same as surfaceCount
 *   unless you register the same key from multiple components, which is
 *   unsupported and undefined behaviour).
 * - `surfaceCount` — alias for dirtyCount exposed for clarity in copy strings
 *   ("N unsaved across M surfaces").
 */
export function useDirtyAggregate(): {
  dirtyCount: number;
  surfaceCount: number;
} {
  const ctx = useContext(DirtyStateContext);
  if (!ctx) {
    throw new Error("useDirtyAggregate must be used inside <DirtyStateProvider>");
  }

  const { subscribeAggregate, getAggregate } = ctx;

  // Initialise from current state, then subscribe for future changes.
  const [aggregate, setAggregate] = useState(() => getAggregate());

  useEffect(() => {
    // Sync in case anything changed between render and the effect.
    setAggregate(getAggregate());
    const unsubscribe = subscribeAggregate(setAggregate);
    return unsubscribe;
  }, [getAggregate, subscribeAggregate]);

  return { dirtyCount: aggregate, surfaceCount: aggregate };
}
