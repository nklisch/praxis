import type { SessionId } from "@praxis/core/types";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import styles from "./authoring-chat-pane.module.css";
import { Composer } from "./composer.js";
import { MessageBubble } from "./message.js";
import { ToolEntry } from "./tool-entry.js";

/** Mode ids that mount an authoring chat pane. */
export type AuthoringModeId = "configure" | "bootstrap";

/** Labels shown in the pane header per mode. */
const MODE_LABEL: Record<AuthoringModeId, string> = {
  configure: "Configure assistant",
  bootstrap: "Course-design assistant",
};

/** Empty-state hint text per mode. */
const MODE_EMPTY_STATE: Record<AuthoringModeId, string> = {
  configure: "Ask me to edit courses, lessons, gates, or customize prompts.",
  bootstrap: "Steer the draft — or say 'confirm and open the course'.",
};

export interface AuthoringChatPaneProps {
  /** Which authoring mode this pane is serving. Controls labels and empty-state copy. */
  mode: AuthoringModeId;
  /** The session id to load history for and send messages to. */
  sessionId: SessionId | null;
  /** When true, the composer is disabled even if a session is active. */
  disabled?: boolean;
}

/**
 * Generic chat pane for authoring surfaces (configure and course-create).
 *
 * Reuses `useStreamedSend` exactly like the main chat route but scoped to the
 * authoring session. `<ConfigureChatPane>` is a thin wrapper that passes
 * `mode="configure"`.
 */
export function AuthoringChatPane({ mode, sessionId, disabled = false }: AuthoringChatPaneProps) {
  const client = usePraxisClient();
  const { items, isStreaming, lastError, send, loadHistory } = useStreamedSend(client);
  const [composerValue, setComposerValue] = useState("");

  // Load the persisted transcript when a session id appears. The pane may be
  // reused across tabs so sessionId can be null while a session is starting.
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per session id
  useEffect(() => {
    if (sessionId) void loadHistory(sessionId);
  }, [sessionId]);

  const handleSend = async (message: string) => {
    if (!sessionId) return;
    await send(sessionId, message);
  };

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <span className={styles.label}>{MODE_LABEL[mode]}</span>
        <span className={styles.status}>
          {!sessionId ? "Starting session…" : isStreaming ? "Thinking…" : "Ready"}
        </span>
      </div>

      <div className={styles.messages}>
        {items.length === 0 && <p className={styles.emptyState}>{MODE_EMPTY_STATE[mode]}</p>}
        {items.map((item) => {
          if (item.kind === "tool-entry") {
            return (
              <ToolEntry
                key={`tc-${item.callId}`}
                toolName={item.toolName}
                status={item.status}
                {...(item.input !== undefined && { input: item.input })}
                {...(item.output !== undefined && { output: item.output })}
                {...(item.errorMessage !== undefined && { errorMessage: item.errorMessage })}
              />
            );
          }
          if (item.kind === "sub-agent") {
            // Sub-agent blocks don't appear in the authoring pane — render nothing.
            return null;
          }
          if (item.kind === "thinking") {
            // Reasoning blocks don't appear in the authoring pane — render nothing.
            return null;
          }
          if (item.kind === "cancel-marker") {
            return null;
          }
          if (item.kind === "pending-message") {
            // Pending messages are teach-mode UI state; authoring panes use a
            // separate session.
            return null;
          }
          if (item.kind === "system-note") {
            // system_note cards don't appear in the authoring pane.
            return null;
          }
          return (
            <MessageBubble
              key={item.id}
              role={item.role}
              content={item.content}
              rawContent={item.rawContent}
              {...(item.streaming !== undefined && { streaming: item.streaming })}
              {...(item.citations !== undefined && { citations: item.citations })}
              {...(item.drafts !== undefined && { drafts: item.drafts })}
            />
          );
        })}
      </div>

      {lastError && (
        <div className={styles.errorBanner} role="alert">
          Error: {lastError}
        </div>
      )}

      <Composer
        value={composerValue}
        onChange={setComposerValue}
        onSend={async (msg) => {
          setComposerValue("");
          await handleSend(msg);
        }}
        disabled={!sessionId || isStreaming || disabled}
      />
    </div>
  );
}
