import type { SessionId } from "@praxis/core/types";
import { useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import { Composer } from "./composer.js";
import styles from "./configure-chat-pane.module.css";
import { MessageBubble } from "./message.js";

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
  const { messages, isStreaming, lastError, send } = useStreamedSend(client);
  const [composerValue, setComposerValue] = useState("");

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
        {messages.length === 0 && (
          <p className={styles.emptyState}>
            Ask me to edit courses, lessons, gates, or customize prompts.
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            rawContent={msg.rawContent}
            {...(msg.streaming !== undefined && { streaming: msg.streaming })}
            {...(msg.citations !== undefined && { citations: msg.citations })}
            {...(msg.drafts !== undefined && { drafts: msg.drafts })}
          />
        ))}
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
