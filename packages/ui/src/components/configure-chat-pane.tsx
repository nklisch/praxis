import type { SessionId } from "@praxis/core/types";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import { Composer } from "./composer.js";
import styles from "./configure-chat-pane.module.css";
import { MessageBubble } from "./message.js";
import { ToolEntry } from "./tool-entry.js";

export interface ConfigureChatPaneProps {
  sessionId: SessionId | null;
  disabled?: boolean;
}

/**
 * The configure-mode chat pane — reuses useStreamedSend exactly like the
 * main chat route, but scoped to the configure session.
 *
 * Left panel in the split-pane layout of each configure tab.
 */
export function ConfigureChatPane({ sessionId, disabled = false }: ConfigureChatPaneProps) {
  const client = usePraxisClient();
  const { items, isStreaming, lastError, send, loadHistory } = useStreamedSend(client);
  const [composerValue, setComposerValue] = useState("");

  // Load the persisted transcript when a session id appears (configure pane
  // is reused across tabs; sessionId can be null while a session is starting).
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
        <span className={styles.label}>Configure assistant</span>
        <span className={styles.status}>
          {!sessionId ? "Starting session…" : isStreaming ? "Thinking…" : "Ready"}
        </span>
      </div>

      <div className={styles.messages}>
        {items.length === 0 && (
          <p className={styles.emptyState}>
            Ask me to edit courses, lessons, gates, or customize prompts.
          </p>
        )}
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
            // Sub-agent blocks don't appear in the configure pane — render nothing.
            return null;
          }
          if (item.kind === "thinking") {
            // Reasoning blocks don't appear in the configure pane — render nothing.
            return null;
          }
          if (item.kind === "cancel-marker") {
            return null;
          }
          if (item.kind === "pending-message") {
            // Pending messages don't appear in the configure pane — they are
            // teach-mode UI state and the configure pane uses a separate session.
            return null;
          }
          if (item.kind === "system-note") {
            // system_note cards don't appear in the configure pane.
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
