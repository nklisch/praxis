import type { SubAgentItem, SubAgentStep } from "@praxis/core/types";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseSubAgentResult {
  /** The current sub-agent item, or null until the first subscription event arrives. */
  item: SubAgentItem | null;
  /** Ordered step list from the current item (empty when item is null). */
  recentSteps: readonly SubAgentStep[];
}

/**
 * Subscribe to sub-agent events for a specific parent call.
 *
 * Mirrors `useActivity()` — opens a `client.subAgent.events({ parentCallId })`
 * stream on mount, folds events into local state, and unsubscribes on unmount.
 * When `parentCallId` changes, the previous subscription is torn down and a
 * new one opens with the new id.
 *
 * On stream error, the hook keeps the last good state (no crash, no reset).
 * The parent component controls lifecycle via the `status` prop on
 * `<SubAgentBlock>` to show settled state independently of the stream.
 */
export function useSubAgent(parentCallId: string): UseSubAgentResult {
  const client = usePraxisClient();
  const [item, setItem] = useState<SubAgentItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    let returnStream: (() => void) | null = null;

    (async () => {
      const iterator = client.subAgent.events({ parentCallId })[Symbol.asyncIterator]();
      returnStream = () => {
        void Promise.resolve(iterator.return?.()).catch(() => {
          // Best-effort cancellation: the stream may already be closed.
        });
      };

      try {
        while (true) {
          const result = await iterator.next();
          if (result.done) break;
          const event = result.value;
          if (cancelled) break;

          switch (event.kind) {
            case "snapshot": {
              // The snapshot is filtered by parentCallId server-side; pick our item.
              const found = event.items.find((it) => it.parentCallId === parentCallId) ?? null;
              setItem(found);
              break;
            }
            case "started": {
              if (event.item.parentCallId === parentCallId) {
                setItem(event.item);
              }
              break;
            }
            case "step_started": {
              if (event.parentCallId === parentCallId) {
                setItem((prev) => {
                  if (prev === null) return prev;
                  // Append the new step; cap at 200 to match the registry limit.
                  const steps = [...prev.steps, event.step].slice(-200);
                  return { ...prev, steps };
                });
              }
              break;
            }
            case "step_settled": {
              if (event.parentCallId === parentCallId) {
                setItem((prev) => {
                  if (prev === null) return prev;
                  const steps = prev.steps.map((s) =>
                    s.callId === event.callId
                      ? { ...s, ok: event.ok, endedAt: Date.now() as SubAgentItem["startedAt"] }
                      : s,
                  );
                  return { ...prev, steps };
                });
              }
              break;
            }
            case "phase_changed": {
              if (event.parentCallId === parentCallId) {
                setItem((prev) => (prev === null ? prev : { ...prev, label: event.label }));
              }
              break;
            }
            case "finished": {
              if (event.parentCallId === parentCallId) {
                setItem((prev) => {
                  if (prev === null) return prev;
                  return {
                    ...prev,
                    status: event.status,
                    endedAt: Date.now() as SubAgentItem["startedAt"],
                    ...(event.errorMessage !== undefined && { errorMessage: event.errorMessage }),
                  };
                });
              }
              break;
            }
          }
        }
      } catch {
        // Stream errored — keep last good state; the block remains visible
        // with whatever progress was captured before the error.
      }
    })();

    return () => {
      cancelled = true;
      returnStream?.();
    };
  }, [client, parentCallId]);

  return { item, recentSteps: item?.steps ?? [] };
}
