/**
 * Slide-in chat panel anchored to the right edge of quiz/homework tabs.
 *
 * Behaviour:
 *  - When open, the panel occupies a fixed column (~380px) in the parent
 *    CSS grid. Body content shrinks proportionally — no overlay.
 *  - Pressing Esc while the panel is focused closes it.
 *  - Threads the same session as the parent tab; messages go through
 *    useStreamedSend just as in the teach-mode ChatTabBody.
 */
import type { SessionId } from "@praxis/core/types";
import { type JSX, useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import { Composer } from "./composer.js";
import { ComposerVerbs } from "./composer-verbs.js";
import { MessageBubble } from "./message.js";
import styles from "./sidekick-panel.module.css";
import { ToolEntry } from "./tool-entry.js";

export interface SidekickPanelProps {
  sessionId: SessionId;
  modeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Inline width override (px) when open. Supplied by the parent's
   * `useResizableWidth` hook so the panel honours per-device persisted
   * widths. When undefined or when `open` is false, the CSS rules apply
   * (`width: 0` closed; the previous fixed `width: 380px` rule was removed
   * — callers always pass `width` when adopting the resizable hook).
   */
  width?: number;
}

/**
 * A slide-in tutor chat panel used by quiz and homework tab bodies.
 * The panel resizes the layout flex column rather than overlaying content.
 */
export function SidekickPanel({
  sessionId,
  modeId,
  open,
  onOpenChange,
  width,
}: SidekickPanelProps): JSX.Element {
  const client = usePraxisClient();
  const { items, isStreaming, lastError, send, cancel } = useStreamedSend(client);
  const [composerValue, setComposerValue] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new items
  const messageCount = items.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on count change; ref is stable
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  // Close on Esc key when panel is focused
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  const handleSend = async (message: string) => {
    await send(sessionId, message);
  };

  return (
    <aside
      className={`${styles.panel}${open ? ` ${styles.open}` : ""}`}
      aria-label="Tutor sidekick"
      aria-hidden={!open}
      onKeyDown={handleKeyDown}
      style={open && width !== undefined ? { width: `${width}px` } : undefined}
    >
      <div className={styles.header}>
        <span className={styles.title}>ask your tutor</span>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Close sidekick"
          onClick={() => onOpenChange(false)}
        >
          ×
        </button>
      </div>

      <div className={styles.messages}>
        {items.length === 0 && (
          <p className={styles.emptyState}>
            ask a question — the tutor is here to nudge, not give away the answer.
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
            // Sub-agent blocks don't appear in the sidekick panel — render nothing.
            return null;
          }
          if (item.kind === "thinking") {
            // Reasoning blocks don't appear in the sidekick panel — render nothing.
            return null;
          }
          if (item.kind === "cancel-marker") {
            return null;
          }
          if (item.kind === "pending-message") {
            // Pending messages don't appear in the sidekick panel — they are
            // teach-mode UI state only.
            return null;
          }
          if (item.kind === "system-note") {
            // system_note cards don't appear in the sidekick panel.
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
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {lastError && <div className={styles.errorBanner}>Error: {lastError}</div>}

      <div className={styles.footer}>
        <ComposerVerbs
          modeId={modeId}
          onPrefill={(seed) => {
            setComposerValue((prev) => (prev ? `${prev} ${seed}` : seed));
            composerRef.current?.focus();
          }}
        />
        <Composer
          ref={composerRef}
          value={composerValue}
          onChange={setComposerValue}
          onSend={async (msg) => {
            setComposerValue("");
            await handleSend(msg);
          }}
          isStreaming={isStreaming}
          onCancel={cancel}
          sketchEnabled={false}
        />
      </div>
    </aside>
  );
}
