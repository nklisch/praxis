/**
 * Subscribe to activity events; when an assignment.issued entry fires,
 * spawn a tab in the assignment's modality. Mounted once at app-shell
 * level (inside ChatRoute).
 *
 * Editorial: no toast, no sound, no focus steal. The new tab appearing
 * in the strip is the affordance — presence without intrusion.
 *
 * Idempotency: assignments are keyed by assignmentId. If a tab for that
 * assignment is already tracked (same spawn attempt arriving twice), the
 * spawn is skipped.
 *
 * The hook receives `openTab` as a parameter rather than calling useTabs()
 * itself. This avoids a duplicate useTabs mount that would fire a second
 * tabs.listOpen call at app-shell level. The ChatRoute already owns the
 * useTabs instance; it passes openTab down here.
 */
import type { AssignmentId, SessionId, TabSummary } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { useEffect, useRef } from "react";
import { usePraxisClient } from "../context/client-context.js";

/**
 * Mount once at app-shell level (e.g. inside ChatRoute). Subscribes to the
 * activity event stream and auto-opens a quiz/homework/exam tab whenever the
 * tutor calls `assignment.create` and the activity rail fires an
 * `assignment.issued` metadata event.
 *
 * @param openTab - the `openTab` function from the ChatRoute's `useTabs()` call.
 */
export function useAssignmentIssuedSpawn(
  openTab: (input: { sessionId: SessionId; courseTitle?: string }) => Promise<TabSummary>,
): void {
  const client = usePraxisClient();
  // Track seen assignmentIds so duplicate events don't open duplicate tabs.
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        for await (const event of client.activity.events()) {
          if (cancelled) break;
          if (event.kind !== "added") continue;

          const metadata = event.item.metadata;
          if (!metadata) continue;
          if (metadata["kind"] !== "assignment.issued") continue;

          const assignmentId = metadata["assignmentId"];
          const parentSessionId = metadata["parentSessionId"];

          if (typeof assignmentId !== "string" || !assignmentId) continue;
          if (typeof parentSessionId !== "string" || !parentSessionId) continue;

          // Idempotency: skip if we already processed this assignment
          if (seenRef.current.has(assignmentId)) continue;
          seenRef.current.add(assignmentId);

          try {
            const handle = await client.session.spawnFromAssignment({
              assignmentId: brandId<"AssignmentId">(assignmentId),
              parentSessionId: brandId<"SessionId">(parentSessionId),
            });

            // Open a tab for the new session but do NOT navigate to it.
            // The student stays where they are; the tab strip shows the new tab.
            await openTab({ sessionId: handle.sessionId });
          } catch {
            // Non-fatal: spawn failure should not crash the activity listener.
            // The student can still manually open an assignment tab.
            seenRef.current.delete(assignmentId);
          }
        }
      } catch {
        // Stream errored — the hook will be remounted on the next render cycle.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, openTab]);
}
