import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

/**
 * Returns the `parentCallId` of the most-recently-started in-flight sub-agent,
 * or null when no sub-agent is currently running.
 *
 * Polls `client.subAgent.list()` on mount (and after each `SubAgentEvent`)
 * by subscribing to the unfiltered event stream. When a new sub-agent starts
 * or finishes, the hook re-evaluates to pick the most recent running item.
 *
 * Used by `<CourseCreateTabBody>` to pass the current parentCallId down to
 * `<SubAgentPanel>`.
 */
export function useCurrentSubAgent(): string | null {
  const client = usePraxisClient();
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (cancelled) return;
      try {
        const items = await client.subAgent.list();
        if (cancelled) return;
        // Pick the most-recently-started running item.
        const running = items
          .filter((it) => it.status === "running")
          .sort((a, b) => b.startedAt - a.startedAt);
        setCurrentCallId(running[0]?.parentCallId ?? null);
      } catch {
        // list() failed — keep last state.
      }
    };

    // Initial fetch.
    void refresh();

    // Subscribe to all events so we refresh whenever sub-agent state changes.
    (async () => {
      try {
        for await (const _event of client.subAgent.events()) {
          if (cancelled) break;
          await refresh();
        }
      } catch {
        // Stream errored — fall to last known state.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  return currentCallId;
}
