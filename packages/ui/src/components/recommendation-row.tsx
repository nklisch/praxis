import type { Recommendation } from "@praxis/core/types";
import styles from "./recommendation-row.module.css";

export interface RecommendationRowProps {
  rec: Recommendation;
  priority: number;
  /** Primary CTA click handler — called with the rec when user clicks. */
  onAction: (rec: Recommendation) => void;
}

/**
 * A single recommendation row in the Workbench what's-next queue.
 *
 * Dispatches on `rec.kind` to render the right title and CTA per
 * recommendation type. The `reason` field is shown as a secondary line.
 * Priority number + a tinted dot are shown in the left marker column.
 */
export function RecommendationRow({ rec, priority, onAction }: RecommendationRowProps) {
  const { kicker, title, ctaLabel, dotColor, isSecondary } = describeRec(rec);

  return (
    <div className={styles.row}>
      <div className={styles.marker}>
        <span className={styles.dot} style={{ background: dotColor }} />
        <span className={styles.priority}>{priority}</span>
      </div>
      <div className={styles.body}>
        <span className={styles.kindKicker}>{kicker}</span>
        <span className={styles.title}>{title}</span>
        {rec.reason && <span className={styles.reason}>{rec.reason}</span>}
      </div>
      <button
        type="button"
        className={isSecondary ? styles.actionSecondary : styles.actionPrimary}
        onClick={() => onAction(rec)}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

interface RecDisplay {
  kicker: string;
  title: string;
  ctaLabel: string;
  dotColor: string;
  isSecondary: boolean;
}

function describeRec(rec: Recommendation): RecDisplay {
  switch (rec.kind) {
    case "resume_session":
      return {
        kicker: rec.mode,
        title: "Resume session",
        ctaLabel: "Resume ↵",
        dotColor: "var(--color-accent)",
        isSecondary: false,
      };
    case "review_cards":
      return {
        kicker: "study skills",
        title: `Spaced review · ${rec.dueNow} card${rec.dueNow !== 1 ? "s" : ""} due`,
        ctaLabel: `Review ${rec.dueNow} card${rec.dueNow !== 1 ? "s" : ""} →`,
        dotColor: "var(--tint-study-skills, #7b9e87)",
        isSecondary: false,
      };
    case "practice_concept":
      return {
        kicker: "teach · suggested",
        title: "Practice a concept",
        ctaLabel: "Practice →",
        dotColor: "var(--tint-teach, #d4a373)",
        isSecondary: false,
      };
    case "resume_draft":
      return {
        kicker: "course design",
        title: "Continue course draft",
        ctaLabel: "Review draft →",
        dotColor: "var(--tint-course-create, #a3b18a)",
        isSecondary: true,
      };
    case "quick_check":
      return {
        kicker: "quiz · suggested",
        title: "Quick check (~3 min)",
        ctaLabel: "Quick check →",
        dotColor: "var(--tint-quiz, #8d99ae)",
        isSecondary: true,
      };
  }
}
