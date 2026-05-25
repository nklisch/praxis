/**
 * composer-async-behavior step-4: Queued / dispatching / failed message bubble.
 *
 * Renders a `PendingMessageItem` as an inline ghost turn in the chat thread.
 * Three sub-states share this one component:
 *
 *   queued      → dashed left border · edit + remove pips
 *   dispatching → dashed left border · remove only (edit hidden — mid-flight)
 *   failed      → danger left border · retry + remove pips + error reason
 *
 * Inline edit mode (queued only): click edit → textarea pre-filled with
 * item.text → Save fires onEdit(id, draft) then exits; Cancel discards.
 * The textarea is replaced by the read-only body on exit.
 *
 * The component uses only motion tokens — no bare ms values.
 */

import type { JSX } from "react";
import { useState } from "react";
import type { PendingMessageItem } from "../hooks/use-streamed-send.js";
import { COPY } from "../lib/copy.js";
import styles from "./queued-message-bubble.module.css";

export interface QueuedMessageBubbleProps {
  item: PendingMessageItem;
  /** Commits an inline edit. Only fires when status === "queued". */
  onEdit: (id: string, newText: string) => void;
  /** Removes from queue (queued / dispatching) or discards (failed). */
  onRemove: (id: string) => void;
  /** Retries the failed item. No-op if not failed. */
  onRetry: (id: string) => void;
}

const MAX_ERROR_DISPLAY = 120;

/** Truncate a string to maxLen chars for inline display; full text goes into title. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

export function QueuedMessageBubble({
  item,
  onEdit,
  onRemove,
  onRetry,
}: QueuedMessageBubbleProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const isQueued = item.status === "queued";
  const isDispatching = item.status === "dispatching";
  const isFailed = item.status === "failed";

  const handleEditClick = () => {
    setDraft(item.text);
    setEditing(true);
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      onEdit(item.id, trimmed);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const turnClass = [styles.chatTurn, isFailed ? styles.failed : styles.queued].join(" ");

  const speakerClass = styles.speaker;

  return (
    <article className={turnClass} aria-label={COPY.queuedBubble.articleAriaLabel(item.status)}>
      {/* Queue position pip — rendered by parent at integration time via index;
          the component receives no index here, so the pip is omitted from this
          component's own DOM. The integration step (step-7) can overlay it if
          needed. Keeping the structure clean for now. */}

      {/* Speaker row */}
      <div className={speakerClass}>
        <span>{COPY.queuedBubble.speakerName}</span>
        <span className={styles.when}>
          {isFailed
            ? COPY.queuedBubble.whenFailed
            : isDispatching
              ? COPY.queuedBubble.whenDispatching
              : COPY.queuedBubble.whenQueued}
        </span>
        {isQueued && <span className={styles.badge}>{COPY.queuedBubble.badgeQueued}</span>}
        {isDispatching && (
          <span className={styles.badge}>{COPY.queuedBubble.badgeDispatching}</span>
        )}
        {isFailed && (
          <span className={`${styles.badge} ${styles.badgeFailed}`}>
            {COPY.queuedBubble.badgeFailed}
          </span>
        )}
      </div>

      {/* Message body — swap to textarea in edit mode */}
      {editing ? (
        <textarea
          className={styles.editTextarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={COPY.queuedBubble.editTextareaAriaLabel}
          rows={3}
          // biome-ignore lint/a11y/noAutofocus: user clicked edit; immediate focus is expected UX
          autoFocus
        />
      ) : (
        <p className={styles.body}>{item.text}</p>
      )}

      {/* Error reason — failed state only */}
      {isFailed && item.errorReason && (
        <p className={styles.errorReason} title={item.errorReason}>
          {truncate(item.errorReason, MAX_ERROR_DISPLAY)}
        </p>
      )}

      {/* Actions row */}
      <div className={styles.actions}>
        {editing ? (
          /* Edit mode: Save + Cancel */
          <>
            <button
              type="button"
              className={`${styles.action} ${styles.actionPrimary}`}
              onClick={handleSave}
              aria-label={COPY.queuedBubble.saveDraftAriaLabel}
            >
              {COPY.queuedBubble.saveLabel}
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={handleCancel}
              aria-label={COPY.queuedBubble.cancelEditAriaLabel}
            >
              {COPY.queuedBubble.cancelLabel}
            </button>
          </>
        ) : (
          <>
            {/* Retry — failed only */}
            {isFailed && (
              <button
                type="button"
                className={`${styles.action} ${styles.actionPrimary}`}
                onClick={() => onRetry(item.id)}
                aria-label={COPY.queuedBubble.retryAriaLabel}
              >
                {COPY.queuedBubble.retryLabel}
              </button>
            )}

            {/* Edit — queued only (hidden when dispatching or failed) */}
            {isQueued && !editing && (
              <button
                type="button"
                className={styles.action}
                onClick={handleEditClick}
                aria-label={COPY.queuedBubble.editAriaLabel}
              >
                {COPY.queuedBubble.editLabel}
              </button>
            )}

            {/* Remove — all non-editing states */}
            <button
              type="button"
              className={`${styles.action} ${styles.actionDanger}`}
              onClick={() => onRemove(item.id)}
              aria-label={COPY.queuedBubble.removeAriaLabel}
            >
              {COPY.queuedBubble.removeLabel}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
