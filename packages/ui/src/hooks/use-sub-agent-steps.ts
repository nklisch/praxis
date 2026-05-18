import type { SubAgentItem, SubAgentStep } from "@praxis/core/types";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseSubAgentStepsResult {
  /** Ordered step list, newest last. Empty until the first snapshot arrives. */
  steps: readonly SubAgentStep[];
  /** Derived from the sub-agent item's status field. `"running"` until settled. */
  status: "running" | "done" | "failed";
  /** Current phase label from the registry. Null until the first event arrives. */
  label: string | null;
}

/**
 * Subscribe to step events for a specific sub-agent run by `parentCallId`.
 *
 * Wraps `useSubAgent` with a narrower contract that callers (e.g. the
 * `<SubAgentBlock>` step-list expansion) need: just the ordered step array
 * and a terminal status.
 *
 * Uses `client.subAgent.events({ parentCallId })` which filters the stream
 * server-side, so only events for this one sub-agent arrive in the loop.
 *
 * On stream error the hook keeps the last good state — same contract as
 * `useSubAgent`.
 */
export function useSubAgentSteps(parentCallId: string): UseSubAgentStepsResult {
  const client = usePraxisClient();
  const [item, setItem] = useState<SubAgentItem | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        for await (const event of client.subAgent.events({ parentCallId })) {
          if (cancelled) break;

          switch (event.kind) {
            case "snapshot": {
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
                      ? { ...s, ok: event.ok, endedAt: Date.now() as SubAgentStep["startedAt"] }
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
        // Stream error — keep last good state.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, parentCallId]);

  const steps = item?.steps ?? [];
  const rawStatus = item?.status ?? "running";
  // Collapse "interrupted" to "failed" for the UI — both mean the run ended badly.
  const status: UseSubAgentStepsResult["status"] =
    rawStatus === "done" ? "done" : rawStatus === "running" ? "running" : "failed";

  return { steps, status, label: item?.label ?? null };
}
