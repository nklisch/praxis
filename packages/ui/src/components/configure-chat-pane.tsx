import type { SessionId } from "@praxis/core/types";
import { AuthoringChatPane } from "./authoring-chat-pane.js";

export interface ConfigureChatPaneProps {
  sessionId: SessionId | null;
  disabled?: boolean;
}

/**
 * The configure-mode chat pane. Thin wrapper over `<AuthoringChatPane>` that
 * pins mode to "configure" and keeps the existing public API intact so that
 * configure-route tabs (`CourseTab`, `GatesTab`, …) need no changes.
 *
 * Left panel in the split-pane layout of each configure tab.
 */
export function ConfigureChatPane({ sessionId, disabled = false }: ConfigureChatPaneProps) {
  return <AuthoringChatPane mode="configure" sessionId={sessionId} disabled={disabled} />;
}
