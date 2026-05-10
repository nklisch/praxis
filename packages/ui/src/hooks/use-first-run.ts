import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseFirstRunResult {
  /** True while the initial flag read is in flight. */
  loading: boolean;
  /**
   * Null while loading; otherwise true if the user is seeing first-run for the
   * first time on this database, false if onboarding has already been completed.
   */
  isFirstRun: boolean | null;
  /**
   * Mark first-run as complete. Writes the flag via IPC and flips local state
   * so the consumer re-renders without a refresh.
   */
  complete: () => Promise<void>;
}

/**
 * Reads the `firstRunCompletedAt` flag from `config_kv` via the IPC config
 * service and exposes a small state machine for the root route to swap in
 * the onboarding flow when appropriate.
 *
 * Fail-open on read error: if the IPC read rejects, the hook treats the user
 * as having already completed first-run rather than locking them behind a
 * broken gate. The underlying error surfaces on the normal app surface where
 * it can be observed and fixed.
 */
export function useFirstRun(): UseFirstRunResult {
  const client = usePraxisClient();
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    client.config
      .firstRunCompleted()
      .then((done) => {
        if (cancelled) return;
        setCompleted(done);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Fail open — treat as completed so the user isn't trapped.
        setCompleted(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const complete = useCallback(async () => {
    await client.config.markFirstRunComplete();
    setCompleted(true);
  }, [client]);

  const isFirstRun = completed === null ? null : !completed;
  return { loading, isFirstRun, complete };
}
