import type {
  AssignmentId,
  CourseId,
  PraxisClient,
  SessionId,
  TabId,
  TabSummary,
} from "@praxis/core/types";
import type { NavigateFn } from "@tanstack/react-router";

/**
 * Pending initial messages keyed by sessionId.
 *
 * When `openSessionInTab` is called with a non-empty `initialMessage`, it stores
 * the message here before navigation. The tab body (e.g. `AuthoringChatPane`) reads
 * and clears this on mount via `consumeInitialMessage`, then sends the message
 * through its own `useStreamedSend` instance so engine events flow to the UI correctly.
 *
 * The map is module-level so it survives the navigation lifecycle without requiring
 * extra React state or context. Entries are cleared by `consumeInitialMessage`.
 */
const pendingInitialMessages = new Map<string, string>();

/**
 * Pop the pending initial message for a session, if any.
 * Call this once from the tab body component on mount; it clears the entry so
 * subsequent mounts don't replay the message.
 */
export function consumeInitialMessage(sessionId: SessionId): string | undefined {
  const msg = pendingInitialMessages.get(sessionId);
  if (msg !== undefined) {
    pendingInitialMessages.delete(sessionId);
  }
  return msg;
}

/**
 * Centralizes the start-session → open-tab → navigate flow used by every
 * entry-point affordance in the Library and course detail surfaces.
 *
 * Call order:
 *  1. `client.session.start(startOpts)` — creates a new session, returns a handle
 *  2. If `initialMessage` is non-empty, store it via `pendingInitialMessages` so the
 *     tab body can pick it up as a `prefillMessage` on mount and send it through its own
 *     `useStreamedSend` instance. This is the correct approach — fire-and-forget sending
 *     before the tab body mounts consumes events before the UI subscribes.
 *  3. `openTab({ sessionId, courseTitle? })` — the `useTabs()` hook's `openTab` callback,
 *     which calls `client.tabs.open` AND updates the shared `TabsProvider` in-memory state
 *     (`openTabs` + `activeTabId`). This is critical: calling `client.tabs.open` directly
 *     bypasses the context update and the new tab body never mounts (the `display:none`
 *     isolation pattern only renders bodies for tabs in `openTabs`).
 *  4. `navigate({ to: "/chat/$tabId", params: { tabId: tab.id } })` — lands the user in the chat workspace
 *
 * Returns the new TabId so callers can act on it if needed.
 *
 * Note: The `NavigateFn` type is `ReturnType<typeof useNavigate>` from TanStack Router.
 * Note: `openTab` must come from `useTabs()` — do NOT pass `client.tabs.open` here.
 */
export async function openSessionInTab(opts: {
  client: PraxisClient;
  navigate: NavigateFn;
  startOpts: { modeId: string; courseId?: CourseId; assignmentId?: AssignmentId };
  courseTitle?: string;
  /**
   * The `openTab` callback from `useTabs()`. Must be the hook's callback, not
   * `client.tabs.open` directly — the hook callback updates `TabsProvider` state so
   * the new tab body mounts and connects to the event stream.
   */
  openTab: (input: { sessionId: SessionId; courseTitle?: string }) => Promise<TabSummary>;
  /**
   * Optional pre-seed message for the session. When non-empty, stored in a module-level
   * map keyed by sessionId. The tab body reads it on mount via `consumeInitialMessage`
   * and sends it through its own `useStreamedSend` instance (via `prefillMessage`).
   */
  initialMessage?: string;
}): Promise<TabId> {
  const handle = await opts.client.session.start(opts.startOpts);

  if (opts.initialMessage !== undefined && opts.initialMessage.trim() !== "") {
    pendingInitialMessages.set(handle.sessionId, opts.initialMessage);
  }

  const tab = await opts.openTab({
    sessionId: handle.sessionId,
    ...(opts.courseTitle !== undefined && { courseTitle: opts.courseTitle }),
  });
  await opts.navigate({ to: "/chat/$tabId", params: { tabId: tab.id } });
  return tab.id;
}
