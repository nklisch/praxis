import type { JSX } from "react";
import { useState } from "react";
import { useSubAgent } from "../hooks/use-sub-agent.js";
import styles from "./sub-agent-block.module.css";

export interface SubAgentBlockProps {
  /** Parent session's tool_call.callId — subscription key for the sub-agent stream. */
  parentCallId: string;
  /** Fallback label displayed until the first subscription event arrives. */
  initialLabel: string;
  /** "in_flight" while the parent tool_result is pending; "settled" once it lands. */
  status: "in_flight" | "settled";
  /** True when the parent tool_result.ok === false. */
  errored?: boolean;
}

/**
 * Inline collapsible block rendered in the chat thread when `course.start_exploration`
 * (or any other `spawnsSubAgent: true` tool) fires.
 *
 * Shows a summary line by default: `▸ <label> · N steps · live`.
 * Clicking expands to reveal the most recent ≤8 step lines, each prefixed with
 * the `└` Unicode bullet.
 *
 * Stays in the items list after the tool settles — it's the historical record
 * of the sub-agent's work, not a transient progress indicator.
 */
export function SubAgentBlock({
  parentCallId,
  initialLabel,
  status,
  errored,
}: SubAgentBlockProps): JSX.Element {
  const { item, recentSteps } = useSubAgent(parentCallId);
  const [expanded, setExpanded] = useState(false);

  const label = item?.label ?? initialLabel;
  const stepCount = recentSteps.length;
  // Live indicator: parent is awaiting tool_result AND the sub-agent is still running.
  const isLive = status === "in_flight" && item?.status === "running";

  return (
    <div className={styles.block}>
      <button
        type="button"
        className={styles.summary}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={styles.chevron} aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
        <span className={styles.label}>{label}</span>
        {stepCount > 0 && (
          <span className={styles.meta}>
            · {stepCount} {stepCount === 1 ? "step" : "steps"}
          </span>
        )}
        {isLive && (
          <span className={styles.live} aria-hidden="true">
            · live
          </span>
        )}
        {errored === true && !isLive && <span className={styles.errored}> · couldn't finish</span>}
      </button>
      {expanded && stepCount > 0 && (
        <ul className={styles.steps} aria-label="Sub-agent steps">
          {recentSteps.slice(-8).map((step) => (
            <li
              key={step.callId}
              className={`${styles.step}${step.ok === false ? ` ${styles.stepFailed}` : ""}`}
            >
              <span className={styles.bullet} aria-hidden="true">
                └
              </span>
              <span className={styles.stepLabel}>{step.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
