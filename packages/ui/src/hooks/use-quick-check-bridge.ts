import type { AssignmentItem, QuickCheckAnswer, SessionId } from "@praxis/core/types";
import { useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface PendingCheck {
  callId: string;
  item: AssignmentItem;
  /** True once a "resolved" event has arrived for this callId. */
  resolved: boolean;
}

export interface UseQuickCheckBridgeResult {
  pending: PendingCheck[];
  resolve: (callId: string, answer: QuickCheckAnswer) => Promise<void>;
}

/**
 * Subscribes to `client.quickCheck.events()` and surfaces pending quick checks
 * for the given session. Returns a `pending` list (in arrival order) and a
 * `resolve` function to call when the student submits an answer.
 *
 * Lifecycle:
 * - On `pending` event matching `sessionId`: append to the pending list.
 * - On `resolved` event: mark the matching check as resolved (card locks).
 * - On unmount: the async iterator is abandoned (no explicit cancel needed;
 *   the server-side stream closes when the renderer disconnects).
 *
 * Note: Only mounted inside TeachChatTabBody. Quick checks aren't part of the
 * quiz/homework/exam tab flow — those modalities don't have a narrating tutor.
 */
export function useQuickCheckBridge(sessionId: SessionId | undefined): UseQuickCheckBridgeResult {
  const client = usePraxisClient();
  const [pending, setPending] = useState<PendingCheck[]>([]);
  // Ref to allow the async loop to see the latest sessionId without re-starting
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    let cancelled = false;

    async function listen() {
      try {
        for await (const event of client.quickCheck.events()) {
          if (cancelled) break;

          if (event.kind === "pending") {
            // Only surface events for the currently active session in this tab
            if (sessionIdRef.current !== undefined && event.sessionId !== sessionIdRef.current) {
              continue;
            }
            setPending((prev) => [
              ...prev,
              { callId: event.callId, item: event.item, resolved: false },
            ]);
          } else if (event.kind === "resolved") {
            setPending((prev) =>
              prev.map((check) =>
                check.callId === event.callId ? { ...check, resolved: true } : check,
              ),
            );
          }
        }
      } catch {
        // Stream ended (tab close / app quit / IPC disconnect) — no recovery needed.
      }
    }

    void listen();

    return () => {
      cancelled = true;
    };
  }, [client]);

  const resolve = async (callId: string, answer: QuickCheckAnswer): Promise<void> => {
    await client.quickCheck.resolve({ callId, answer });
  };

  return { pending, resolve };
}
