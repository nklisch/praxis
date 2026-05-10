/**
 * Exam-only clarification affordance. A single corner pill button labeled
 * "ask for clarification". Clicking opens a one-shot prompt input. On
 * submit, sends a message to the session asking the tutor to rephrase the
 * current item; the response renders as an ephemeral overlay.
 *
 * The exam-mode session is restricted server-side to the `clarification`
 * tool only; this component enforces the same mental model client-side by
 * offering a focused single-purpose prompt.
 */
import type { SessionId } from "@praxis/core/types";
import { type JSX, useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import styles from "./clarification-pill.module.css";

export interface ClarificationPillProps {
  sessionId: SessionId;
}

const DISMISSAL_DELAY_MS = 30_000;

/**
 * Renders a pill button anchored to the bottom-right corner of its parent.
 * The parent should have `position: relative`.
 */
export function ClarificationPill({ sessionId }: ClarificationPillProps): JSX.Element {
  const client = usePraxisClient();
  const { items, isStreaming, send } = useStreamedSend(client);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [overlay, setOverlay] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pull latest assistant response out of items and surface it as overlay
  useEffect(() => {
    // Use a manual reverse-scan instead of findLast for ES2022 compat.
    // Skip interstitial items — only message items have role/streaming.
    let lastContent: string | undefined;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item?.kind === "message" && item.role === "assistant" && !item.streaming) {
        lastContent = item.content;
        break;
      }
    }
    if (lastContent) {
      setOverlay(lastContent);
      // Auto-dismiss after 30s
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        setOverlay(null);
      }, DISMISSAL_DELAY_MS);
    }
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [items]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!question.trim()) return;
    const prompt = `Please restate the current item in plainer wording. My question: ${question.trim()}`;
    setQuestion("");
    setOpen(false);
    await send(sessionId, prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <>
      {/* Ephemeral overlay showing the clarification response */}
      {overlay && (
        <div className={styles.overlay} role="status" aria-live="polite">
          <div className={styles.overlayContent}>
            <span className={styles.overlayLabel}>clarification</span>
            <p className={styles.overlayText}>{overlay}</p>
            <button
              type="button"
              className={styles.overlayDismiss}
              onClick={() => setOverlay(null)}
            >
              dismiss
            </button>
          </div>
        </div>
      )}

      {/* Input prompt when open */}
      {open && (
        <div className={styles.promptBox}>
          <input
            ref={inputRef}
            type="text"
            className={styles.promptInput}
            placeholder="What would you like restated?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Clarification question"
          />
          <button
            type="button"
            className={styles.promptSubmit}
            disabled={isStreaming || !question.trim()}
            onClick={() => void handleSubmit()}
          >
            {isStreaming ? "asking…" : "ask"}
          </button>
        </div>
      )}

      {/* The pill trigger */}
      <button
        type="button"
        className={styles.pill}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Ask for clarification"
      >
        ask for clarification
      </button>
    </>
  );
}
