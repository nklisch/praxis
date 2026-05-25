/**
 * ActionPip — state-driven indicator beside an action affordance.
 *
 * A small circular pip that shows the in-flight / settled state of an
 * optimistic action. Invisible when state is "idle".
 *
 * Visual contract (from .mockups/design-system/components.css § .action-pip):
 *   idle      → opacity 0, pointer-events none
 *   pending   → tertiary background, pulsing dot, no glyph (::after is the dot)
 *   success   → success background, ✓ glyph
 *   failed    → danger background, ⚠ glyph, clickable (opens FailurePopover)
 *   retrying  → accent background, ↺ glyph, no spin (Productive attitude)
 *
 * Motion: opacity + color transitions only; size is constant. No squash or
 * overshoot. Animations collapse under prefers-reduced-motion via motion.css
 * duration tokens and the local @media rule in action-card.module.css.
 *
 * In "failed" state the pip is rendered as a <button> for full a11y
 * keyboard support; in all other states it's a presentational <span>.
 */
import type { ActionState } from "../hooks/use-optimistic-action.js";
import styles from "./action-card.module.css";

export interface ActionPipProps {
  state: ActionState;
  /** Accessible label. Default: "Action status: <state>". */
  "aria-label"?: string;
  /** Called when the pip is clicked in failed state — typically opens FailurePopover. */
  onClick?: () => void;
  className?: string;
}

export function ActionPip({
  state,
  "aria-label": ariaLabel,
  onClick,
  className,
}: ActionPipProps): React.ReactElement {
  const isVisible = state !== "idle";

  const modifierClass: string | undefined = isVisible
    ? (
        {
          pending: styles["actionPip--pending"],
          success: styles["actionPip--success"],
          failed: styles["actionPip--failed"],
          retrying: styles["actionPip--retrying"],
          // idle won't be reached here (isVisible guard above) but TS needs it
          idle: undefined,
        } as Record<ActionState, string | undefined>
      )[state]
    : undefined;

  const classes = [
    styles.actionPip,
    isVisible ? styles["actionPip--show"] : undefined,
    modifierClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const defaultLabel = `Action status: ${state}`;

  // Failed state needs a real button element for keyboard accessibility.
  // All other states are presentational only.
  if (state === "failed") {
    return (
      <button
        type="button"
        className={classes}
        aria-label={ariaLabel ?? defaultLabel}
        onClick={onClick}
      />
    );
  }

  return <span className={classes} aria-hidden={!isVisible} />;
}
