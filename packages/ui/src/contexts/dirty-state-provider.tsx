import { createContext, type ReactNode, useCallback, useRef } from "react";

/**
 * Internal context shape — not exported as a public API.
 * Consumers use `useDirtyState` and `useDirtyAggregate` instead.
 */
export interface DirtyStateContextValue {
  /** Mark a key as dirty. Idempotent. */
  setDirty(key: string): void;
  /** Clear a key's dirty state. Idempotent. */
  clearDirty(key: string): void;
  /**
   * Subscribe to state changes for a single key.
   * The listener fires with `true` (dirty) or `false` (clean) on every change.
   * Returns an unsubscribe function.
   */
  subscribe(key: string, listener: (isDirty: boolean) => void): () => void;
  /**
   * Subscribe to changes in the aggregate dirty count.
   * The listener fires with the new count (number of dirty keys) on every change.
   * Returns an unsubscribe function.
   */
  subscribeAggregate(listener: (count: number) => void): () => void;
  /** Snapshot read — returns current dirty key count. */
  getAggregate(): number;
}

export const DirtyStateContext = createContext<DirtyStateContextValue | null>(null);

interface DirtyStateProviderProps {
  children: ReactNode;
}

/**
 * Provider for the cross-surface dirty-state tracker.
 *
 * Maintains a `Set<string>` of currently-dirty keys internally. Consumers
 * register via `useDirtyState(key)` and read aggregates via
 * `useDirtyAggregate()`.
 *
 * Uses a ref-based subscription model (no useState) so that the provider
 * itself never re-renders when dirty state changes — only the subscribed leaf
 * hooks do.
 */
export function DirtyStateProvider({ children }: DirtyStateProviderProps) {
  // The canonical Set of dirty keys — owned by a ref so mutations don't
  // trigger a provider re-render.
  const dirtyKeysRef = useRef<Set<string>>(new Set());

  // Per-key listeners: key → Set of listeners for that key.
  const keyListenersRef = useRef<Map<string, Set<(isDirty: boolean) => void>>>(new Map());

  // Aggregate listeners: called when the total count changes.
  const aggregateListenersRef = useRef<Set<(count: number) => void>>(new Set());

  const notifyKey = useCallback((key: string, isDirty: boolean) => {
    const listeners = keyListenersRef.current.get(key);
    if (listeners) {
      for (const listener of listeners) {
        listener(isDirty);
      }
    }
  }, []);

  const notifyAggregate = useCallback(() => {
    const count = dirtyKeysRef.current.size;
    for (const listener of aggregateListenersRef.current) {
      listener(count);
    }
  }, []);

  const setDirty = useCallback(
    (key: string) => {
      if (dirtyKeysRef.current.has(key)) return; // idempotent
      dirtyKeysRef.current.add(key);
      notifyKey(key, true);
      notifyAggregate();
    },
    [notifyKey, notifyAggregate],
  );

  const clearDirty = useCallback(
    (key: string) => {
      if (!dirtyKeysRef.current.has(key)) return; // idempotent
      dirtyKeysRef.current.delete(key);
      notifyKey(key, false);
      notifyAggregate();
    },
    [notifyKey, notifyAggregate],
  );

  const subscribe = useCallback(
    (key: string, listener: (isDirty: boolean) => void): (() => void) => {
      if (!keyListenersRef.current.has(key)) {
        keyListenersRef.current.set(key, new Set());
      }
      // biome-ignore lint/style/noNonNullAssertion: just set it above
      keyListenersRef.current.get(key)!.add(listener);

      return () => {
        keyListenersRef.current.get(key)?.delete(listener);
        if (keyListenersRef.current.get(key)?.size === 0) {
          keyListenersRef.current.delete(key);
        }
      };
    },
    [],
  );

  const subscribeAggregate = useCallback((listener: (count: number) => void): (() => void) => {
    aggregateListenersRef.current.add(listener);
    return () => {
      aggregateListenersRef.current.delete(listener);
    };
  }, []);

  const getAggregate = useCallback(() => dirtyKeysRef.current.size, []);

  return (
    <DirtyStateContext.Provider
      value={{ setDirty, clearDirty, subscribe, subscribeAggregate, getAggregate }}
    >
      {children}
    </DirtyStateContext.Provider>
  );
}
