import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import styles from "./concept-node.module.css";

export type ConceptTone = "mastered" | "in-progress" | "not-started" | "locked";

/**
 * Data passed to the ConceptNode via React Flow's `data` prop.
 * Keep props pure data so Phase 11's gate editor can reuse this node in
 * editable mode without baking "read-only" into the component.
 *
 * Extends Record<string, unknown> per React Flow v12's Node data constraint.
 */
export interface ConceptNodeData extends Record<string, unknown> {
  /** Concept display name. */
  name: string;
  /** Decay-aware mastery fraction 0..1. */
  mastery: number;
  /** Whether any study has been recorded for this concept. */
  studied: boolean;
  /** Whether the concept's lesson is gated and locked. */
  locked: boolean;
}

/** React Flow node type with ConceptNodeData payload. */
export type ConceptFlowNode = Node<ConceptNodeData, "concept">;

export function getConceptTone(data: ConceptNodeData): ConceptTone {
  if (data.locked) return "locked";
  if (data.mastery >= 0.7) return "mastered";
  if (data.mastery > 0) return "in-progress";
  return "not-started";
}

/**
 * Inner display for a concept node — exported separately for unit testing
 * without needing a React Flow context (Handle components require ReactFlowProvider).
 */
export function ConceptNodeDisplay({ data }: { data: ConceptNodeData }) {
  const tone = getConceptTone(data);

  return (
    <div className={`${styles.node} ${styles[tone]}`} data-tone={tone}>
      <span className={styles.name}>{data.name}</span>

      {tone === "locked" ? (
        <span className={styles.lockIcon} aria-label="locked" role="img">
          🔒
        </span>
      ) : (
        <span className={styles.score}>
          {tone === "mastered" && (
            <span className={styles.checkMark} aria-hidden="true">
              ✓{" "}
            </span>
          )}
          {data.mastery.toFixed(2)}
        </span>
      )}
    </div>
  );
}

/**
 * React Flow custom node for a single concept.
 * Color-blind safe: uses shape, icon, and hue together — never hue alone.
 *
 * Tones:
 *  mastered    → green border + check mark (✓)
 *  in-progress → amber border + progress fraction
 *  not-started → neutral border + 0.00
 *  locked      → gray border + lock icon (🔒)
 *
 * In tests, render `<ConceptNodeDisplay data={...} />` directly to avoid
 * needing a ReactFlowProvider context (Handle requires it).
 */
export function ConceptNode({ data }: NodeProps<ConceptFlowNode>) {
  return (
    <>
      {/* Top connection handle for React Flow edges */}
      <Handle type="target" position={Position.Top} className={styles.handle} />
      <ConceptNodeDisplay data={data} />
      {/* Bottom connection handle for React Flow edges */}
      <Handle type="source" position={Position.Bottom} className={styles.handle} />
    </>
  );
}
