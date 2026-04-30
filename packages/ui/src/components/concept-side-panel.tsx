import type { ConceptId, GateView, Lesson } from "@praxis/core/types";
import styles from "./concept-side-panel.module.css";

export interface ConceptInfo {
  id: ConceptId;
  name: string;
  mastery: number;
  studied: boolean;
  locked: boolean;
  /** Lessons that contain this concept (for references). */
  lessons: Lesson[];
}

interface ConceptSidePanelProps {
  concept: ConceptInfo;
  /** All gate views — used to display the gate guarding this concept's lesson. */
  gates: GateView[];
  onClose: () => void;
}

/**
 * Slide-in panel that shows concept details when a node is clicked on the progress map.
 *
 * Data is passed as props from the parent (CourseMapRoute) that already loaded
 * lessons + gates — avoids a new IPC channel just for single-concept lookup.
 *
 * Phase 11 note: keep this component pure-display; the gate editor will open
 * a richer edit panel from the same vocabulary.
 */
export function ConceptSidePanel({ concept, gates, onClose }: ConceptSidePanelProps) {
  // Find the gate guarding this concept's first lesson.
  const guardingGate = gates.find(
    (g) =>
      g.gate.guards.kind === "lesson" &&
      concept.lessons.some((l) => l.id === (g.gate.guards as { lessonId: string }).lessonId),
  );

  const masteryPct = Math.round(concept.mastery * 100);

  return (
    <aside className={styles.panel} aria-label={`Details: ${concept.name}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>{concept.name}</h2>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <div className={styles.body}>
        {/* Mastery section */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Mastery</h3>
          {concept.locked ? (
            <p className={styles.lockedNote}>
              <span aria-label="locked" role="img">
                🔒
              </span>{" "}
              Locked — complete prerequisites to unlock.
            </p>
          ) : (
            <>
              <div className={styles.masteryBar}>
                <progress
                  className={styles.masteryProgress}
                  max={1}
                  value={concept.mastery}
                  aria-label={`Mastery: ${masteryPct}%`}
                />
                <span className={styles.masteryLabel}>{masteryPct}%</span>
              </div>
              {concept.mastery >= 0.7 && (
                <p className={styles.masteredNote}>
                  <span aria-hidden="true">✓</span> Mastered (threshold: 70%)
                </p>
              )}
            </>
          )}
        </section>

        {/* Gate info */}
        {guardingGate && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Gate</h3>
            <p className={styles.gateSummary}>{guardingGate.summaryText}</p>
            {guardingGate.gate.state.kind !== "unlocked" &&
              guardingGate.gate.state.kind !== "overridden" && (
                <>
                  <div className={styles.gateProgressRow}>
                    <progress
                      className={styles.gateProgress}
                      max={1}
                      value={guardingGate.progress}
                      aria-label={`Gate progress: ${Math.round(guardingGate.progress * 100)}%`}
                    />
                    <span className={styles.gateProgressLabel}>
                      {Math.round(guardingGate.progress * 100)}%
                    </span>
                  </div>
                  {guardingGate.lockReason && (
                    <p className={styles.lockReason}>{guardingGate.lockReason}</p>
                  )}
                </>
              )}
            {(guardingGate.gate.state.kind === "unlocked" ||
              guardingGate.gate.state.kind === "overridden") && (
              <p className={styles.unlockedNote}>
                <span aria-hidden="true">✓</span> Gate unlocked
              </p>
            )}
          </section>
        )}

        {/* References from lessons */}
        {concept.lessons.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Appears in</h3>
            <ul className={styles.lessonList}>
              {concept.lessons.map((lesson) => (
                <li key={lesson.id} className={styles.lessonItem}>
                  <span className={styles.lessonTitle}>{lesson.title}</span>
                  {lesson.references.length > 0 && (
                    <ul className={styles.refList}>
                      {lesson.references.map((ref, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: references have no stable id
                        <li key={i} className={styles.refItem}>
                          <span className={styles.refKind}>{ref.kind}</span>
                          {ref.source}
                          {ref.locator?.page ? ` (p.${ref.locator.page})` : ""}
                          {ref.locator?.section ? ` [${ref.locator.section}]` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
