import type { SessionId } from "@praxis/core/types";
import { useTabs } from "./use-tabs.js";

/**
 * Returns the sessionId of the first open bootstrap-mode session tab,
 * or null when no bootstrap tab is open.
 *
 * Used by DocumentsSection to determine whether to show the "This session"
 * tab in the library documents view.
 */
export function useActiveBootstrapSession(): SessionId | null {
  const { openTabs } = useTabs();
  const tab = openTabs.find((t) => t.kind === "session" && t.modeId === "bootstrap");
  return tab && tab.kind === "session" ? tab.sessionId : null;
}
