/**
 * Right column of the three-column chat workspace.
 *
 * Composed of two sections per the locked Refined Bubbles mock (Option 4):
 *  1. Concepts active — a simple list of concept names + mastery level,
 *     sourced from session-active concepts. Placeholder-rendered when no
 *     session or concept data is available.
 *  2. Sidekick — contextual tutor notes / observation excerpt. For now
 *     this renders a placeholder; the teach-mode sidekick restyle lands
 *     in a sibling story.
 *
 * The panel itself is a plain scrollable aside; the parent (ChatRoute)
 * owns the width via useResizableWidth and passes it via inline style.
 * The ResizeHandle is rendered by the parent — this component does not
 * duplicate it.
 */
import type { CSSProperties, JSX } from "react";
import styles from "./chat-right-panel.module.css";

export interface ConceptEntry {
  id: string;
  name: string;
  /** 0–1 mastery level from BKT. */
  mastery: number;
}

export interface ChatRightPanelProps {
  /** Active concepts for the current session, sorted by relevance. */
  concepts?: ConceptEntry[];
  /** Whether concept data is still loading. */
  conceptsLoading?: boolean;
  /** Sidekick note from the most recent indexer pass (optional). */
  sidekickNote?: string;
  /**
   * Inline style — used by the parent to apply the persisted width from
   * `useResizableWidth`. Applied to the panel root `<aside>`.
   */
  style?: CSSProperties;
}

/**
 * Right panel: concepts active + sidekick section.
 * Width is applied by the parent via inline `style`.
 */
export function ChatRightPanel({
  concepts,
  conceptsLoading,
  sidekickNote,
  style,
}: ChatRightPanelProps): JSX.Element {
  return (
    <aside className={styles.panel} style={style} aria-label="Concepts and sidekick">
      {/* ── Concepts active section ─────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionKicker}>Concepts active</h3>
        {conceptsLoading ? (
          <p className={styles.placeholder}>Loading…</p>
        ) : !concepts || concepts.length === 0 ? (
          <p className={styles.placeholder}>No concepts yet — start a session.</p>
        ) : (
          <ul className={styles.conceptList}>
            {concepts.map((c) => (
              <li key={c.id} className={styles.conceptRow}>
                <span className={styles.conceptName}>{c.name}</span>
                <span
                  className={`${styles.masteryBadge} ${
                    c.mastery >= 0.7
                      ? styles.masteryHigh
                      : c.mastery >= 0.45
                        ? styles.masteryMid
                        : styles.masteryLow
                  }`}
                >
                  m.&nbsp;{c.mastery.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Sidekick section ────────────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionKicker}>Sidekick</h3>
        {sidekickNote ? (
          <p className={styles.sidekickNote}>{sidekickNote}</p>
        ) : (
          <p className={styles.placeholder}>Contextual notes will appear here during a session.</p>
        )}
      </section>
    </aside>
  );
}
