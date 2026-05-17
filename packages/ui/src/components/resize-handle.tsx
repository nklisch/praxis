import type { JSX } from "react";
import type { UseResizableWidthResult } from "../hooks/use-resizable-width.js";
import styles from "./resize-handle.module.css";

export type ResizeHandleProps = UseResizableWidthResult["handleProps"] & {
  side: "left" | "right";
  className?: string;
};

/**
 * Editorial hairline drag handle. Renders as a 1px line with a 6px hit
 * target via padding; hover/active tint pulls from the editorial palette
 * (`--color-border` resting → `--color-accent` on hover/drag).
 *
 * Position is the caller's responsibility — drop it where the panel edge
 * sits in the parent layout (sibling to the panel, not child).
 */
export function ResizeHandle({ side, className, ...handleProps }: ResizeHandleProps): JSX.Element {
  const cls = [styles.handle, side === "left" ? styles.left : styles.right, className]
    .filter(Boolean)
    .join(" ");
  return <div className={cls} {...handleProps} />;
}
