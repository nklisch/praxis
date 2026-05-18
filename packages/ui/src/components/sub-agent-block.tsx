import type { JSX } from "react";
import { useState } from "react";
import { useSubAgentSteps } from "../hooks/use-sub-agent-steps.js";
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
 * Inline marginalia block rendered in the chat thread when `course.start_drafting`
 * (or any other `spawnsSubAgent: true` tool) fires.
 *
 * Visual contract (per locked mock 03-explorer-running.html):
 * - Accent left-border, secondary background — marginalia posture.
 * - Mono kicker: `¶ sub-agent · {label} · {N} steps`.
 * - Pulse dot when running.
 * - Collapsed by default; click expands scrollable step list.
 * - Each step: ✓ (done/ok), ✗ (done/failed), ◐ (running) prefix, then serif italic label.
 *
 * Stays in the items list after the sub-agent settles — it's the historical
 * record of the sub-agent's work, not a transient progress indicator.
 */
export function SubAgentBlock({
  parentCallId,
  initialLabel,
  status,
  errored,
}: SubAgentBlockProps): JSX.Element {
  const { steps, status: agentStatus, label } = useSubAgentSteps(parentCallId);
  const [expanded, setExpanded] = useState(false);

  const displayLabel = label ?? initialLabel;
  const stepCount = steps.length;
  const isLive = status === "in_flight" && agentStatus === "running";
  const isSettledFailed = (status === "settled" && errored === true) || agentStatus === "failed";

  return (
    <div className={styles.block} aria-label="Sub-agent block">
      {/* ── Header row (always visible) ───────────────────────────────────── */}
      <div className={styles.head}>
        {isLive && <span className={styles.pulse} aria-hidden="true" />}
        <span className={styles.kicker} aria-hidden="true">
          ¶
        </span>
        <span className={styles.kickerText}>
          sub-agent
          {" · "}
          <span className={styles.kickerLabel}>{displayLabel}</span>
          {stepCount > 0 && (
            <span className={styles.kickerMeta}>
              {" · "}
              {stepCount} {stepCount === 1 ? "step" : "steps"}
            </span>
          )}
          {isSettledFailed && !isLive && (
            <span className={styles.kickerFailed}>{" · couldn't finish"}</span>
          )}
        </span>
      </div>

      {/* ── Expand toggle + step list ──────────────────────────────────────── */}
      {stepCount > 0 && (
        <>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "▾ collapse" : "▸ show steps"}
          </button>

          {expanded && (
            <ul className={styles.steps} aria-label="Sub-agent steps">
              {steps.slice(-8).map((step) => {
                const isDone = step.ok !== undefined;
                const stepOk = step.ok === true;
                const stepRunning = !isDone;
                return (
                  <li
                    key={step.callId}
                    className={[
                      styles.step,
                      isDone && stepOk ? styles.stepDone : "",
                      isDone && !stepOk ? styles.stepFailed : "",
                      stepRunning ? styles.stepRunning : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className={styles.stepIcon} aria-hidden="true">
                      {isDone && stepOk ? "✓" : isDone && !stepOk ? "✗" : "◐"}
                    </span>
                    <span className={styles.stepLabel}>{step.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
