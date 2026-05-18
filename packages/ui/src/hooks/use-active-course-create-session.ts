import type { SessionId } from "@praxis/core/types";
import { useTabs } from "./use-tabs.js";

/**
 * Returns the sessionId of the first open course-create-mode session tab,
 * or null when no course-create tab is open.
 *
 * Used by DocumentsSection to determine whether to show the "This session"
 * tab in the library documents view.
 */
export function useActiveCourseCreateSession(): SessionId | null {
  const { openTabs } = useTabs();
  const tab = openTabs.find((t) => t.kind === "session" && t.modeId === "course-create");
  return tab && tab.kind === "session" ? tab.sessionId : null;
}
