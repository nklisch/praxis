import type { JSX } from "react";
import { useState } from "react";
import { useSubAgent } from "../hooks/use-sub-agent.js";
import styles from "./sub-agent-panel.module.css";

export interface SubAgentPanelProps {
  /** parentCallId of the active sub-agent, or null when no exploration is running. */
  parentCallId: string | null;
}

/**
 * Bootstrap tab body's optional side panel showing the full sub-agent step
 * transcript. Hidden by default; the user toggles via a "show sub-agent
 * transcript" / "hide sub-agent transcript" button.
 *
 * Renders null when `parentCallId` is null (no active exploration). When set,
 * the toggle button is always visible so the user can reveal the transcript.
 *
 * Uses `useSubAgent(parentCallId)` to subscribe to live events; shows ALL
 * steps (no 8-step cap). Uses a simple scrollable list; a virtualized list
 * would be warranted at 50+ steps, but the course-create budget caps steps at
 * ≤200 and the panel is already off-screen by default, so the simpler form
 * is sufficient for v1.
 */
export function SubAgentPanel({ parentCallId }: SubAgentPanelProps): JSX.Element | null {
  const [visible, setVisible] = useState(false);

  if (parentCallId === null) return null;

  // Collapsed: render only the toggle button. No outer `.panel` div, no top
  // margin, no border-top, no padding — so the parent flex/grid layout
  // collapses the vertical footprint to one button-line. See feature
  // epic-ui-rendering-stability-state-transitions.
  if (!visible) {
    return (
      <button
        type="button"
        className={styles.toggleCollapsed}
        onClick={() => setVisible(true)}
        aria-expanded={false}
      >
        show sub-agent transcript
      </button>
    );
  }

  // Expanded: full panel chrome + transcript.
  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setVisible(false)}
        aria-expanded={true}
      >
        hide sub-agent transcript
      </button>
      <SubAgentTranscript parentCallId={parentCallId} />
    </div>
  );
}

/** Inner component that subscribes to the sub-agent stream — only mounted when panel is visible. */
function SubAgentTranscript({ parentCallId }: { parentCallId: string }): JSX.Element {
  const { item, recentSteps } = useSubAgent(parentCallId);
  const label = item?.label ?? "reading your materials";
  const status = item?.status ?? "running";

  return (
    <div className={styles.transcript}>
      <p className={styles.transcriptHeader}>
        <span className={styles.transcriptLabel}>{label}</span>
        {status === "running" && (
          <span className={styles.live} aria-hidden="true">
            · live
          </span>
        )}
        {status === "done" && <span className={styles.done}> · done</span>}
        {status === "failed" && <span className={styles.failed}> · couldn't finish</span>}
      </p>
      {recentSteps.length === 0 ? (
        <p className={styles.empty}>waiting for steps…</p>
      ) : (
        <ul className={styles.steps} aria-label="Sub-agent full transcript">
          {recentSteps.map((step, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: steps are append-only; index is stable
              key={`${step.callId}-${i}`}
              className={`${styles.step}${step.ok === false ? ` ${styles.stepFailed}` : ""}`}
            >
              <span className={styles.bullet} aria-hidden="true">
                └
              </span>
              <span className={styles.stepLabel}>{step.label}</span>
              {step.ok === false && (
                <span className={styles.stepError} aria-label="step failed">
                  ✗
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
