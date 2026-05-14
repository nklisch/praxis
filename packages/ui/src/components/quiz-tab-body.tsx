/**
 * Quiz modality tab body.
 *
 * Layout: full-width AssignmentCard as the primary surface, with a
 * slide-in SidekickPanel at the right edge the student can summon via
 * the "?" button or keyboard shortcut.
 *
 * v1 scope-back: the one-item-at-a-time flashcard rhythm described in
 * the design is deferred. This ship's goal is the layout flip (assignment
 * as primary), sidekick panel, and the mode-aware composer chips. A
 * follow-up can add the card-stack navigation.
 */
import type { SessionId, SessionTabSummary } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import type { JSX } from "react";
import { useState } from "react";
import { useResizableWidth } from "../hooks/use-resizable-width.js";
import { AssignmentCard } from "./assignment-card.js";
import styles from "./quiz-tab-body.module.css";
import { ResizeHandle } from "./resize-handle.js";
import { SidekickPanel } from "./sidekick-panel.js";

export interface QuizTabBodyProps {
  tab: SessionTabSummary;
}

/**
 * Full-surface quiz body. Assignment is the primary content; the tutor
 * sidekick slides in from the right on demand.
 */
export function QuizTabBody({ tab }: QuizTabBodyProps): JSX.Element {
  const [sidekickOpen, setSidekickOpen] = useState(false);

  // SessionId is directly available; tab is already narrowed to SessionTabSummary.
  const sessionId = tab.sessionId as SessionId;

  // Persisted user-resizable width for the sidekick. Per-device
  // (localStorage); shared key across quiz/homework so a width set in one
  // mode carries to the other. See feature
  // resizable-panels-tests-and-sidekick-adoption.
  const { width: sidekickWidth, handleProps: sidekickHandleProps } = useResizableWidth({
    storageKey: "praxis.panel.sidekick.width",
    defaultWidth: 380,
    minWidth: 280,
    maxWidth: 640,
    side: "left",
  });

  return (
    <div
      className={`${styles.container}${sidekickOpen ? ` ${styles.sidekickOpen}` : ""}`}
      onKeyDown={(e) => {
        if (
          e.key === "?" &&
          (e.target as HTMLElement).tagName !== "INPUT" &&
          (e.target as HTMLElement).tagName !== "TEXTAREA"
        ) {
          setSidekickOpen((v) => !v);
        }
      }}
    >
      {/* Kicker bar */}
      <div className={styles.kicker}>
        <span className={styles.kickerMode}>quiz</span>
        {tab.title && <span className={styles.kickerTitle}>{tab.title}</span>}
        <button
          type="button"
          className={`${styles.sidekickToggle}${sidekickOpen ? ` ${styles.sidekickToggleActive}` : ""}`}
          onClick={() => setSidekickOpen((v) => !v)}
          aria-label={sidekickOpen ? "Close tutor" : "Ask tutor (?)"}
          title="Toggle tutor sidekick (?)"
        >
          ?
        </button>
      </div>

      {/* Main body: assignment + optional sidekick */}
      <div className={styles.body}>
        <div className={styles.assignmentPane}>
          {tab.assignmentId ? (
            <AssignmentCard assignmentId={brandId<"AssignmentId">(tab.assignmentId as string)} />
          ) : (
            <div className={styles.noAssignment}>
              <p>no assignment is linked to this session.</p>
            </div>
          )}
        </div>

        {sidekickOpen && <ResizeHandle side="left" {...sidekickHandleProps} />}
        <SidekickPanel
          sessionId={sessionId}
          modeId="quiz"
          open={sidekickOpen}
          onOpenChange={setSidekickOpen}
          width={sidekickWidth}
        />
      </div>
    </div>
  );
}
