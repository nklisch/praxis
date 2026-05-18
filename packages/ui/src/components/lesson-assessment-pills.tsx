import type { LessonAssessment, LessonId } from "@praxis/core/types";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./lesson-assessment-pills.module.css";

/**
 * Minimal shape needed to render a pill — purpose + timing only.
 * Matches LessonAssessment and ProposedLessonAssessmentEntry alike.
 */
export interface AssessmentPillEntry {
  purpose: "readiness" | "practice" | "checkpoint";
  timing: "before" | "after" | "interleaved";
}

/**
 * Maps a purpose to the mock vocabulary.
 *
 * Schema purposes: "readiness" | "practice" | "checkpoint"
 * Mock pills:
 *   readiness  → READY (sage / tint-bootstrap)
 *   practice   → HW    (indigo / tint-homework)
 *   checkpoint → QUIZ  (slate  / tint-quiz)
 */
type PillVariant = "ready" | "home" | "check";

interface PillSpec {
  label: string;
  timing: string;
  variant: PillVariant;
}

function toPillSpec(a: AssessmentPillEntry): PillSpec {
  switch (a.purpose) {
    case "readiness":
      return { label: "READY", timing: a.timing, variant: "ready" };
    case "practice":
      return { label: "HW", timing: a.timing, variant: "home" };
    case "checkpoint":
      return { label: "QUIZ", timing: a.timing, variant: "check" };
  }
}

// ── Props variants ────────────────────────────────────────────────────────────

interface PropsWithData {
  /** Pre-loaded entries for one lesson (caller manages loading). */
  assessments: AssessmentPillEntry[];
  lessonId?: never;
}

interface PropsWithId {
  /** Lesson id — component fetches via praxisClient.artifacts.lessonAssessments. */
  lessonId: LessonId;
  assessments?: never;
}

export type LessonAssessmentPillsProps = PropsWithData | PropsWithId;

/**
 * Colour-coded assessment-plan pills for a single lesson row.
 *
 * Two usage modes:
 *   1. Pass `lessonId` — component self-fetches from the DB via the client.
 *      Use in configure Course tab where lessons have real IDs.
 *   2. Pass `assessments` — caller supplies pre-loaded entries.
 *      Use in DraftCard where proposed assessments have purpose+timing but no DB rows yet.
 *
 * Renders nothing when the lesson has no assessments.
 *
 * Colour mapping:
 *   READY → sage (--tint-bootstrap)
 *   HW    → indigo (--tint-homework)
 *   QUIZ  → slate (--tint-quiz)
 */
export function LessonAssessmentPills(props: LessonAssessmentPillsProps) {
  if (props.lessonId !== undefined) {
    return <FetchingPills lessonId={props.lessonId} />;
  }
  return <PillsDisplay assessments={props.assessments} />;
}

// ── Internal: fetching variant ────────────────────────────────────────────────

function FetchingPills({ lessonId }: { lessonId: LessonId }) {
  const client = usePraxisClient();
  const [assessments, setAssessments] = useState<LessonAssessment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client.artifacts.lessonAssessments(lessonId)
      .then((rows) => {
        if (!cancelled) setAssessments(rows);
      })
      .catch(() => {
        // Pills are decorative — silently ignore fetch failures.
      });
    return () => {
      cancelled = true;
    };
  }, [client, lessonId]);

  if (assessments === null) return null; // loading — render nothing (pills are decorative)
  return <PillsDisplay assessments={assessments} />;
}

// ── Internal: render ──────────────────────────────────────────────────────────

function PillsDisplay({ assessments }: { assessments: AssessmentPillEntry[] }) {
  if (assessments.length === 0) return null;

  const specs = assessments.map(toPillSpec);

  return (
    <span className={styles.stack}>
      {specs.map((spec, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: pills are ordered, stable per render
        <span key={i} className={`${styles.pill} ${styles[spec.variant]}`}>
          {spec.label}
          <span className={styles.timing}>{spec.timing}</span>
        </span>
      ))}
    </span>
  );
}
