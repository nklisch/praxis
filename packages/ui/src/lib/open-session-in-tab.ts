import type { AssignmentId, CourseId, PraxisClient, StudentId, TabId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import type { NavigateFn } from "@tanstack/react-router";

/**
 * Centralizes the start-session → open-tab → navigate flow used by every
 * entry-point affordance in the Library and course detail surfaces.
 *
 * Call order:
 *  1. `client.session.start(startOpts)` — creates a new session, returns a handle
 *  2. `client.tabs.open({ sessionId, courseTitle? })` — creates a tab bound to that session
 *  3. `navigate({ to: "/chat/$tabId", params: { tabId: tab.id } })` — lands the user in the chat workspace
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
}): Promise<TabId> {
  const handle = await opts.client.session.start(opts.startOpts);
  // studentId is ignored by TabsClient — the IPC server resolves it from the
  // active student. Pass an empty branded value to satisfy the TabsService interface.
  const tab = await opts.client.tabs.open({
    studentId: brandId<"StudentId">("") as StudentId,
    sessionId: handle.sessionId,
    ...(opts.courseTitle !== undefined && { courseTitle: opts.courseTitle }),
  });
  await opts.navigate({ to: "/chat/$tabId", params: { tabId: tab.id } });
  return tab.id;
}
