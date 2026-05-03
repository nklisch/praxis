/**
 * Exam modality tab body.
 *
 * Full-tab proctored layout. No chat thread visible — the only conversational
 * affordance is the ClarificationPill corner button, which supports a single
 * one-shot rephrasing request. The exam-mode session is restricted server-side
 * to the `clarification` tool only.
 *
 * The examLockdown logic that previously lived in ChatTabBody moves here:
 * the assignment is always locked (no chat) until submitted.
 */
import type { SessionId, TabSummary } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import type { JSX } from "react";
import { AssignmentCard } from "./assignment-card.js";
import { ClarificationPill } from "./clarification-pill.js";
import styles from "./exam-tab-body.module.css";

export interface ExamTabBodyProps {
  tab: TabSummary;
}

/**
 * Full-surface exam body. The assignment is the only content; the chat
 * thread is not rendered. A ClarificationPill is anchored to the bottom-right
 * for one-shot rephrasing requests only.
 */
export function ExamTabBody({ tab }: ExamTabBodyProps): JSX.Element {
  const sessionId = tab.sessionId as SessionId;

  return (
    <div className={styles.container}>
      {/* Kicker bar */}
      <div className={styles.kicker}>
        <span className={styles.kickerMode}>exam</span>
        {tab.title && <span className={styles.kickerTitle}>{tab.title}</span>}
        <span className={styles.kickerNotice}>chat is muted during the exam</span>
      </div>

      {/* Main body: full-width assignment, relative for ClarificationPill positioning */}
      <div className={styles.body}>
        {tab.assignmentId ? (
          <AssignmentCard
            assignmentId={brandId<"AssignmentId">(tab.assignmentId as string)}
            examLockdown={false}
          />
        ) : (
          <div className={styles.noAssignment}>
            <p>no assignment is linked to this session.</p>
          </div>
        )}

        {/* ClarificationPill anchored within the body */}
        <ClarificationPill sessionId={sessionId} />
      </div>
    </div>
  );
}
