/**
 * Bootstrap modality tab body.
 *
 * Two-pane layout: chat on the left (~60%) for tutor conversation; a draft
 * course outline on the right (~40%) that updates as the explorer adds
 * units, lessons, and assessments.
 *
 * v1 deferred work:
 * - The draft outline panel renders a placeholder stub. The outline should
 *   subscribe to `course.show_draft` tool results (already accumulated in
 *   the chat message stream via useStreamedSend's `drafts` field) and render
 *   a tree of units → lessons. This is deferred because it requires extracting
 *   the draft-from-messages plumbing and designing the live-update subscription.
 *   The left pane (chat) is fully functional via the existing ChatTabBody logic.
 * - The left pane reuses the existing teach-tab chat implementation directly.
 */
import type { TabSummary } from "@praxis/core/types";
import type { JSX } from "react";
import styles from "./bootstrap-tab-body.module.css";
import { TeachChatTabBody } from "./chat-tab-body.js";

export interface BootstrapTabBodyProps {
  tab: TabSummary;
}

/**
 * Split-pane bootstrap body: chat on left, course outline stub on right.
 * Left pane is the full existing teach chat. Right pane is deferred (v1 stub).
 */
export function BootstrapTabBody({ tab }: BootstrapTabBodyProps): JSX.Element {
  return (
    <div className={styles.container}>
      {/* Left: existing chat body (reused in full) */}
      <div className={styles.chatPane}>
        <TeachChatTabBody tab={tab} />
      </div>

      {/* Right: draft outline — v1 stub, full outline deferred */}
      <aside className={styles.outlinePane} aria-label="Course outline">
        <div className={styles.outlineHeader}>
          <span className={styles.outlineTitle}>course outline</span>
        </div>
        <div className={styles.outlinePlaceholder}>
          {/* TODO(phase-16-follow-up): subscribe to course.show_draft tool results
              from the message stream and render a tree of units → lessons here.
              The `drafts` field on ChatMessage (from useStreamedSend) already
              accumulates ProposedCourse objects. */}
          <p>the outline will appear here as the tutor builds the course.</p>
        </div>
      </aside>
    </div>
  );
}
