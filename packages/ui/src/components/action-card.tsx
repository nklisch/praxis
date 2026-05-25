/**
 * ActionCard — in-chat affordance for user-initiated engine work.
 *
 * The canonical container for an optimistic-dispatch action mid-thread. It
 * composes a `__body` slot (label + title content) with an `__action` slot
 * (the trigger button + pip + popover) using the design-system contract
 * from .mockups/design-system/components.css § .action-card.
 *
 * Usage:
 *   const action = useOptimisticAction({ dispatch: saveFlashcards });
 *   <ActionCard
 *     label="Tutor suggestion"
 *     title="Save as flashcards"
 *     action={action}
 *     actionLabel="Save"
 *   />
 *
 * The card never disables its action button — only the pip beside it changes
 * to reflect state. This is the canonical UX contract for the whole refactor.
 */
import type { ReactNode } from "react";
import type { UseOptimisticActionResult } from "../hooks/use-optimistic-action.js";
import { COPY } from "../lib/copy.js";
import styles from "./action-card.module.css";
import { ActionPip } from "./action-pip.js";
import { FailurePopover } from "./failure-popover.js";

export interface ActionCardProps {
  /** Upper kicker label in the body slot (e.g. "Tutor suggestion"). */
  label: string;
  /** Italic title describing the action (e.g. "Save as flashcards"). */
  title: string;
  /**
   * The result from `useOptimisticAction`. The card wires the trigger,
   * state-driven pip, and popover all from this object.
   */
  // biome-ignore lint/suspicious/noExplicitAny: TParams is not relevant at the card level
  action: UseOptimisticActionResult<any>;
  /** Label for the trigger button. */
  actionLabel: string;
  /** Additional content below the title (e.g. item count, description). */
  children?: ReactNode;
  /** Accessible label for the trigger button. Defaults to `actionLabel`. */
  actionAriaLabel?: string;
}

export function ActionCard({
  label,
  title,
  action,
  actionLabel,
  children,
  actionAriaLabel,
}: ActionCardProps): React.ReactElement {
  const showPopover = action.state === "failed";

  return (
    <div className={styles.actionCard}>
      <div className={styles.actionCard__body}>
        <div className={styles.actionCard__label}>{label}</div>
        <p className={styles.actionCard__title}>{title}</p>
        {children}
      </div>

      {/* __action slot: relative-positioned so the popover can anchor here */}
      <div className={styles.actionCard__action}>
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={actionAriaLabel ?? actionLabel}
          onClick={() => {
            // trigger is a no-op if no params are required; callers wrapping
            // the card pass undefined implicitly.
            action.trigger(undefined);
          }}
        >
          {actionLabel}
        </button>

        <ActionPip
          state={action.state}
          onClick={() => {
            // Pip click in failed state opens the popover — which is rendered
            // below; the state itself controls visibility.
          }}
        />

        {showPopover && (
          <FailurePopover
            label={COPY.actionPip.failedLabel}
            reason={action.errorReason}
            actions={[
              {
                label: COPY.actionPip.retryLabel,
                onClick: () => action.retry(),
                variant: "primary",
              },
              {
                label: COPY.actionPip.dismissLabel,
                onClick: () => action.dismiss(),
                variant: "secondary",
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
