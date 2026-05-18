/**
 * Parent-child session registry.
 *
 * Tracks two pieces of UI-only state:
 *   1. `childToParent` — maps a child sessionId to its parent sessionId.
 *      Populated when `useAssignmentIssuedSpawn` successfully spawns a child.
 *   2. `pulseKeys` — maps a parent sessionId to a monotonically-increasing
 *      counter. Incremented each time a `system_note` event arrives in that
 *      parent session's stream so the tab strip can restart its pulse animation.
 *
 * Both maps are in-memory; they start empty on each app mount and are filled
 * via `recordSpawn` / `triggerPulse` callbacks exposed through context.
 *
 * Per the context-hook-pair pattern: `ParentChildProvider` mounts once at
 * app-shell level; `useParentChild()` throws when outside the provider.
 */

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export interface ParentChildContextValue {
  /**
   * Record that `childSessionId` was spawned from `parentSessionId`.
   * Idempotent — re-recording the same pair is a no-op.
   */
  recordSpawn(childSessionId: string, parentSessionId: string): void;

  /**
   * Return the parent sessionId for a given child sessionId, or undefined
   * when no parent is recorded (session is top-level).
   */
  getParentSessionId(sessionId: string): string | undefined;

  /**
   * Increment the pulse key for `parentSessionId`. Each increment restarts
   * the CSS animation on the parent tab.
   */
  triggerPulse(parentSessionId: string): void;

  /**
   * Current pulse key for `parentSessionId`. 0 = never pulsed.
   * The key is used as the `key` prop on the pulse element so React
   * re-mounts it (restarting the CSS animation) on rapid-fire events.
   */
  getPulseKey(parentSessionId: string): number;
}

const ParentChildContext = createContext<ParentChildContextValue | null>(null);

export function ParentChildProvider({ children }: { children: ReactNode }) {
  // Stable ref for the child→parent map (no re-render on changes —
  // tab strip reads via getPulseKey/getParentSessionId callbacks).
  const childToParentRef = useRef<Map<string, string>>(new Map());

  // State map for pulse keys — changes here drive re-renders in the tab strip.
  const [pulseKeys, setPulseKeys] = useState<Map<string, number>>(() => new Map());

  const recordSpawn = useCallback((childSessionId: string, parentSessionId: string): void => {
    if (childToParentRef.current.has(childSessionId)) return;
    childToParentRef.current.set(childSessionId, parentSessionId);
  }, []);

  const getParentSessionId = useCallback((sessionId: string): string | undefined => {
    return childToParentRef.current.get(sessionId);
  }, []);

  const triggerPulse = useCallback((parentSessionId: string): void => {
    setPulseKeys((prev) => {
      const next = new Map(prev);
      next.set(parentSessionId, (next.get(parentSessionId) ?? 0) + 1);
      return next;
    });
  }, []);

  const getPulseKey = useCallback(
    (parentSessionId: string): number => {
      return pulseKeys.get(parentSessionId) ?? 0;
    },
    [pulseKeys],
  );

  const value = useMemo<ParentChildContextValue>(
    () => ({ recordSpawn, getParentSessionId, triggerPulse, getPulseKey }),
    [recordSpawn, getParentSessionId, triggerPulse, getPulseKey],
  );

  return <ParentChildContext.Provider value={value}>{children}</ParentChildContext.Provider>;
}

/**
 * Read the parent-child registry. Throws when called outside
 * `<ParentChildProvider>` — surfacing missing-provider bugs immediately.
 */
export function useParentChild(): ParentChildContextValue {
  const ctx = useContext(ParentChildContext);
  if (!ctx) {
    throw new Error("useParentChild must be used within a ParentChildProvider");
  }
  return ctx;
}

/**
 * Optional variant — returns null when outside a provider.
 * Used in `useStreamedSend` which may be exercised in tests without the provider.
 */
export function useParentChildOptional(): ParentChildContextValue | null {
  return useContext(ParentChildContext);
}
