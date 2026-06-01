/**
 * FailurePopover — inline failure detail anchored to an action affordance.
 *
 * Appears below the trigger when an optimistic action transitions to "failed".
 * Carries the error reason and retry / dismiss actions.
 *
 * Positioning: absolute, anchored inside `.actionCard__action` (the
 * `position: relative` parent from action-card.module.css). Callers are
 * responsible for conditionally rendering this component — it renders nothing
 * when there is no error to show.
 *
 * COPY for the retry / dismiss button labels is taken from lib/copy.ts to keep
 * all UI-visible strings in one place.
 */
import { COPY } from "../lib/copy.js";
import styles from "./action-card.module.css";

export interface FailurePopoverAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | undefined;
}

export interface FailurePopoverProps {
  /** Kicker label above the reason text. Defaults to "Failed". */
  label?: string | undefined;
  /** Human-readable explanation of the failure. */
  reason?: string | undefined;
  /** Array of action buttons (typically retry + dismiss). */
  actions: FailurePopoverAction[];
}

export function FailurePopover({
  label = COPY.actionPip.failedLabel,
  reason,
  actions,
}: FailurePopoverProps): React.ReactElement {
  return (
    <div className={styles.failurePopover} role="dialog" aria-label="Action failed">
      <div className={styles.failurePopover__label}>{label}</div>
      {reason !== undefined && <p className={styles.failurePopover__reason}>{reason}</p>}
      <div className={styles.failurePopover__actions}>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={
              action.variant === "primary" ? "btn btn-primary btn--sm" : "btn btn-secondary btn--sm"
            }
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
