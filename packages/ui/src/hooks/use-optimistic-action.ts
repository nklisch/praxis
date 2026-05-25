/**
 * useOptimisticAction — shared hook for the canonical optimistic-dispatch pattern.
 *
 * Every in-chat affordance that triggers async engine work uses this hook.
 * The affordance fires without blocking; a pip beside it conveys state;
 * failures surface inline with retry. (See `useActionEscalation` for the
 * second tier — strip escalation after ~30s.)
 *
 * State machine:
 *   idle → pending → success   (auto-resets to idle after `resetSuccessAfterMs`)
 *                  → failed    (stays until retry() or dismiss())
 *   failed → retrying → success
 *                     → failed
 *
 * Streaming / externally-settled variants (e.g. course-materialize where the
 * success signal arrives via a separate event stream) use `externalSettle()`.
 * This keeps the same hook surface rather than a separate variant —
 * `externalSettle` is safe to call regardless of the current state; it no-ops
 * if `state === "idle"` (i.e. dispatch hasn't fired yet).
 *
 * Pattern: optimistic-dispatch (see .claude/rules/patterns.md once doc lands).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ActionState = "idle" | "pending" | "success" | "failed" | "retrying";

export interface UseOptimisticActionOpts<TParams> {
  /** The async work to fire. Throwing here transitions to "failed". */
  dispatch: (params: TParams) => Promise<void>;
  /** Called after a successful dispatch (or a successful externalSettle). */
  onSuccess?(): void;
  /** Called after a failed dispatch (or a failed externalSettle). */
  onError?(err: unknown): void;
  /**
   * How long (ms) to hold the "success" state before returning to "idle".
   * The pip flashes briefly then vanishes. Default: 800.
   */
  resetSuccessAfterMs?: number;
}

export interface UseOptimisticActionResult<TParams> {
  state: ActionState;
  /** Human-readable reason string extracted from the thrown error. */
  errorReason?: string;
  /** Fire the action. Captures `params` so `retry()` can replay. */
  trigger(params: TParams): void;
  /** Re-dispatches with the originally captured params. No-op if no prior trigger. */
  retry(): void;
  /** Transitions `failed` → `idle`. Clears errorReason. */
  dismiss(): void;
  /**
   * Settle the in-progress action from an external signal (e.g. a streaming
   * event that confirms the result). Typically called from a `useEffect` that
   * watches an event stream.
   *
   * Guards:
   * - No-ops if state is `"idle"` (dispatch hasn't fired).
   * - No-ops if state is already `"success"` or `"failed"` (already settled).
   */
  externalSettle(state: "success" | "failed", reason?: string): void;
}

/**
 * Extract a human-readable message from an unknown thrown value.
 * Mirrors the pattern used in use-streamed-send.ts.
 */
function extractReason(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

export function useOptimisticAction<TParams>(
  opts: UseOptimisticActionOpts<TParams>,
): UseOptimisticActionResult<TParams> {
  const [state, setState] = useState<ActionState>("idle");
  const [errorReason, setErrorReason] = useState<string | undefined>(undefined);

  // Capture dispatch params at trigger-time so retry() can replay without
  // needing user re-input.
  const capturedParamsRef = useRef<TParams | undefined>(undefined);

  // Stable ref to the latest opts so the run() closure doesn't go stale.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Track the current state synchronously in a ref so externalSettle can
  // guard transitions without needing a second setState call.
  const stateRef = useRef<ActionState>("idle");

  // Reset-success timer handle — cleared on unmount or re-trigger.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Unmount guard — don't call setState on an unmounted component.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (resetTimerRef.current !== undefined) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  /** Sync helper to update both the React state and the shadow ref atomically. */
  const setStateSynced = useCallback((newState: ActionState) => {
    stateRef.current = newState;
    setState(newState);
  }, []);

  /**
   * Core dispatch runner — shared by trigger() and retry().
   */
  const run = useCallback(
    async (params: TParams, transitionalState: "pending" | "retrying") => {
      if (resetTimerRef.current !== undefined) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = undefined;
      }

      setStateSynced(transitionalState);
      setErrorReason(undefined);

      try {
        await optsRef.current.dispatch(params);

        if (!mountedRef.current) return;

        // Only settle if we're still in the transitional state (externalSettle
        // may have already settled us; in that case, skip).
        if (stateRef.current !== transitionalState) return;

        setStateSynced("success");
        optsRef.current.onSuccess?.();

        // Auto-reset to idle after the pip flash window.
        const ms = optsRef.current.resetSuccessAfterMs ?? 800;
        resetTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            if (stateRef.current === "success") {
              setStateSynced("idle");
            }
          }
          resetTimerRef.current = undefined;
        }, ms);
      } catch (err) {
        if (!mountedRef.current) return;

        // Only transition to failed if we're still in the transitional state.
        if (stateRef.current !== transitionalState) return;

        setStateSynced("failed");
        setErrorReason(extractReason(err));
        optsRef.current.onError?.(err);
      }
    },
    [setStateSynced],
  );

  const trigger = useCallback(
    (params: TParams) => {
      capturedParamsRef.current = params;
      void run(params, "pending");
    },
    [run],
  );

  const retry = useCallback(() => {
    if (capturedParamsRef.current === undefined) return;
    void run(capturedParamsRef.current, "retrying");
  }, [run]);

  const dismiss = useCallback(() => {
    if (resetTimerRef.current !== undefined) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = undefined;
    }
    setStateSynced("idle");
    setErrorReason(undefined);
  }, [setStateSynced]);

  const externalSettle = useCallback(
    (newState: "success" | "failed", reason?: string) => {
      // Guard: only settle if we're in a transitional (in-flight) state.
      const current = stateRef.current;
      if (current === "idle" || current === "success" || current === "failed") {
        return;
      }

      if (newState === "success") {
        setStateSynced("success");
        setErrorReason(undefined);
        optsRef.current.onSuccess?.();

        if (resetTimerRef.current !== undefined) {
          clearTimeout(resetTimerRef.current);
        }
        const ms = optsRef.current.resetSuccessAfterMs ?? 800;
        resetTimerRef.current = setTimeout(() => {
          if (mountedRef.current && stateRef.current === "success") {
            setStateSynced("idle");
          }
          resetTimerRef.current = undefined;
        }, ms);
      } else {
        setStateSynced("failed");
        setErrorReason(reason ?? "An unexpected error occurred.");
        optsRef.current.onError?.(new Error(reason ?? "An unexpected error occurred."));
      }
    },
    [setStateSynced],
  );

  return {
    state,
    errorReason,
    trigger,
    retry,
    dismiss,
    externalSettle,
  };
}
