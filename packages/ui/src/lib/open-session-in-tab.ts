import type { AssignmentId, CourseId, PraxisClient, TabId } from "@praxis/core/types";
import type { NavigateFn } from "@tanstack/react-router";

/**
 * Centralizes the start-session → open-tab → navigate flow used by every
 * entry-point affordance in the Library and course detail surfaces.
 *
 * Call order:
 *  1. `client.session.start(startOpts)` — creates a new session, returns a handle
 *  2. If `initialMessage` is provided and non-empty, fire-and-forget a `client.session.send`
 *     so the message is in-flight when the user arrives in the chat tab. A transient failure
 *     is non-blocking — it logs a warning and navigation continues normally.
 *  3. `client.tabs.open({ sessionId, courseTitle? })` — creates a tab bound to that session
 *  4. `navigate({ to: "/chat/$tabId", params: { tabId: tab.id } })` — lands the user in the chat workspace
 *
 * Returns the new TabId so callers can act on it if needed.
 *
 * Note: The `NavigateFn` type is `ReturnType<typeof useNavigate>` from TanStack Router.
 */
export async function openSessionInTab(opts: {
  client: PraxisClient;
  navigate: NavigateFn;
  startOpts: { modeId: string; courseId?: CourseId; assignmentId?: AssignmentId };
  courseTitle?: string;
  /** Optional pre-seed message sent to the session before the user arrives. Whitespace-only values are ignored. */
  initialMessage?: string;
}): Promise<TabId> {
  const handle = await opts.client.session.start(opts.startOpts);

  if (opts.initialMessage !== undefined && opts.initialMessage.trim() !== "") {
    const { sessionId } = handle;
    const message = opts.initialMessage;
    // Fire-and-forget: start consuming the send stream so the message is in-flight
    // when the user arrives, but don't block tab-open or navigation on it.
    // If the pre-seed fails for any transient reason, log a warning and proceed —
    // the user can type the same message themselves.
    void (async () => {
      try {
        for await (const _event of opts.client.session.send(sessionId, message)) {
          // Drain events; the session service persists them server-side.
        }
      } catch (err) {
        console.warn("[openSessionInTab] initial message send failed (non-blocking):", err);
      }
    })();
  }

  const tab = await opts.client.tabs.open({
    sessionId: handle.sessionId,
    ...(opts.courseTitle !== undefined && { courseTitle: opts.courseTitle }),
  });
  await opts.navigate({ to: "/chat/$tabId", params: { tabId: tab.id } });
  return tab.id;
}
