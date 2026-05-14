/**
 * Homework modality tab body.
 *
 * Same layout as QuizTabBody: full-width AssignmentCard as the primary
 * surface with a slide-in SidekickPanel at the right edge. The kicker
 * uses "homework" label and the sidekick uses homework-specific verbs.
 *
 * The underlying AssignmentCard already handles per-item sketch canvases
 * for math items (Phase 15a), per-item response auto-save (1s debounce),
 * and workRubric "show your work" inputs. No additional behaviour needed
 * at this layer for v1.
 */
import type { SessionId, SessionTabSummary } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import type { JSX } from "react";
import { useState } from "react";
import { useResizableWidth } from "../hooks/use-resizable-width.js";
import { AssignmentCard } from "./assignment-card.js";
import styles from "./homework-tab-body.module.css";
import { ResizeHandle } from "./resize-handle.js";
import { SidekickPanel } from "./sidekick-panel.js";

export interface HomeworkTabBodyProps {
  tab: SessionTabSummary;
}

/**
 * Full-surface homework body. Assignment is the primary content; the tutor
 * sidekick slides in from the right on demand.
 */
export function HomeworkTabBody({ tab }: HomeworkTabBodyProps): JSX.Element {
  const [sidekickOpen, setSidekickOpen] = useState(false);

  const sessionId = tab.sessionId as SessionId;

  // Persisted user-resizable width for the sidekick. Per-device
  // (localStorage); shared key with quiz mode. See feature
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
        <span className={styles.kickerMode}>homework</span>
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
          modeId="homework"
          open={sidekickOpen}
          onOpenChange={setSidekickOpen}
          width={sidekickWidth}
        />
      </div>
    </div>
  );
}
