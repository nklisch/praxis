import type { SessionHandle } from "@praxis/core/types";
import type { CSSProperties } from "react";
import styles from "./mode-header.module.css";
import { getModeMeta } from "./mode-meta.js";

export interface ModeHeaderProps {
  session: SessionHandle | null;
  starting: boolean;
  onNewChat: () => void;
  newChatDisabled: boolean;
}

/**
 * Editorial-style header that replaces the chat's plain "Session active"
 * toolbar. Each mode has its own typographic ornament, italic display name,
 * deck line, and tint that flows through a single CSS custom property so
 * subsequent rules don't have to know about the mode.
 *
 * Three states:
 *   - opening (starting && !session) — pulsing italic deck with no mode yet
 *   - idle    (!session)             — neutral "no session" header
 *   - active  (session)              — full editorial title with deck
 */
export function ModeHeader({ session, starting, onNewChat, newChatDisabled }: ModeHeaderProps) {
  // ── Opening state ───────────────────────────────────────────────────────
  if (starting && !session) {
    return (
      <header
        className={styles.header}
        style={{ "--mode-tint": "var(--color-text-muted)" } as CSSProperties}
      >
        <span className={styles.ornament} aria-hidden="true">
          ·
        </span>
        <span className={styles.kicker}>
          <span className={styles.kickerDot} aria-hidden="true" />
          OPENING
        </span>
        <div className={styles.titleRow}>
          <span className={styles.opening} role="status" aria-live="polite">
            <span>starting a session</span>
            <span className={styles.openingDot} aria-hidden="true">
              .
            </span>
            <span className={styles.openingDot} aria-hidden="true">
              .
            </span>
            <span className={styles.openingDot} aria-hidden="true">
              .
            </span>
          </span>
        </div>
        <div className={styles.actions} />
      </header>
    );
  }

  // ── Idle state ──────────────────────────────────────────────────────────
  if (!session) {
    return (
      <header
        className={styles.header}
        style={{ "--mode-tint": "var(--color-text-muted)" } as CSSProperties}
      >
        <span className={styles.ornament} aria-hidden="true">
          ·
        </span>
        <span className={styles.kicker}>
          <span className={styles.kickerDot} aria-hidden="true" />
          IDLE
        </span>
        <div className={styles.titleRow}>
          <span className={styles.name}>no session</span>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionButton}
            onClick={onNewChat}
            disabled={newChatDisabled}
          >
            New chat
          </button>
        </div>
      </header>
    );
  }

  // ── Active state ────────────────────────────────────────────────────────
  const meta = getModeMeta(session.modeId);

  return (
    <header
      className={styles.header}
      style={{ "--mode-tint": meta.tint } as CSSProperties}
      data-mode={session.modeId}
    >
      <span className={styles.ornament} aria-hidden="true">
        {meta.ornament}
      </span>
      <span className={styles.kicker}>
        <span className={styles.kickerDot} aria-hidden="true" />
        MODE
      </span>
      <div className={styles.titleRow}>
        <span className={styles.name}>{meta.name}</span>
        {meta.deck && (
          <span className={styles.deck}>
            <span className={styles.deckDash} aria-hidden="true">
              —
            </span>
            {meta.deck}
          </span>
        )}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionButton}
          onClick={onNewChat}
          disabled={newChatDisabled}
        >
          New chat
        </button>
      </div>
    </header>
  );
}
