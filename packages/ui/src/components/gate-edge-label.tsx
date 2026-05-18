import type { GateView } from "@praxis/core/types";
import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import styles from "./gate-edge-label.module.css";

export interface GateEdgeLabelData extends Record<string, unknown> {
  gate: GateView;
  /**
   * True when the user has an unsaved threshold change on this edge.
   * Renders the edge and label in --color-warning to signal the pending edit.
   */
  dirty?: boolean;
}

/** React Flow edge type with GateEdgeLabelData payload. */
export type GateFlowEdge = Edge<GateEdgeLabelData, "gateEdge">;

/**
 * React Flow custom edge that renders the gate's summaryText and — for locked
 * gates — a progress bar showing how close the student is to unlocking.
 *
 * Uses EdgeLabelRenderer to render the label in a `<div>` (HTML context) rather
 * than SVG, which allows rich markup like <progress>.
 *
 * Tone: "open" (unlocked/overridden) vs "locked".
 */
export function GateEdgeLabel({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<GateFlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  if (!data) {
    // Edge without gate data — render a plain edge with no label.
    return <BaseEdge id={id} path={edgePath} />;
  }

  const { gate, dirty } = data;
  const isUnlocked = gate.gate.state.kind === "unlocked" || gate.gate.state.kind === "overridden";

  // Tone precedence: dirty (unsaved threshold change) > open > locked.
  const tone = dirty ? "dirty" : isUnlocked ? "open" : "locked";

  // Extract mastery threshold for display (mastery-threshold criteria only).
  const minScore =
    gate.gate.successCriteria.kind === "mastery-threshold"
      ? gate.gate.successCriteria.minScore
      : null;
  const thresholdLabel = minScore !== null ? `${Math.round(minScore * 100)}%` : null;

  return (
    <>
      <BaseEdge id={id} path={edgePath} className={`${styles.edge} ${styles[tone]}`} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className={`${styles.label} ${styles[tone]}`}
          data-testid="gate-edge-label"
          data-dirty={dirty ? "true" : undefined}
        >
          {thresholdLabel && (
            <span className={styles.threshold} aria-label={`Mastery threshold: ${thresholdLabel}`}>
              {thresholdLabel}
            </span>
          )}
          <span className={styles.summaryText}>{gate.summaryText}</span>
          {!isUnlocked && (
            <progress
              className={styles.progressBar}
              max={1}
              value={gate.progress}
              aria-label={`Gate progress: ${Math.round(gate.progress * 100)}%`}
            />
          )}
          {!isUnlocked && gate.lockReason && (
            <span className={styles.lockReason}>{gate.lockReason}</span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
