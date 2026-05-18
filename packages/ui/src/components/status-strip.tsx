import type { ActivityItem } from "@praxis/core/types";
import { useActivity } from "../hooks/use-activity.js";
import styles from "./status-strip.module.css";

/**
 * Near-invisible ambient status surface mounted directly beneath the top nav.
 * Folds ActivityRegistry events into a single-line summary per active item.
 *
 * - Idle (no items): opacity 0, height 0 — consumes no space, no chrome visible.
 * - Active: reveals with a subtle fade; mono kicker label + detail + optional
 *   hairline progress bar. Done items show ✓; running items show a pulsing dot.
 *
 * Mount once at the root layout (router.tsx). Not inside route bodies.
 */
export function StatusStrip() {
  const { items } = useActivity();
  const hasWork = items.length > 0;

  return (
    <div
      role="status"
      className={[styles.strip, hasWork ? styles.hasWork : ""].filter(Boolean).join(" ")}
      aria-live="polite"
      aria-label="Background activity"
    >
      {items.map((item) => (
        <StatusItem key={item.id} item={item} />
      ))}
    </div>
  );
}

interface StatusItemProps {
  item: ActivityItem;
}

function StatusItem({ item }: StatusItemProps) {
  const isDone = item.status === "done";
  const isFailed = item.status === "failed";
  const isRunning = item.status === "running";

  return (
    <span
      className={[styles.item, isDone && styles.itemDone, isFailed && styles.itemFailed]
        .filter(Boolean)
        .join(" ")}
    >
      {isRunning && <span className={styles.pulse} aria-hidden="true" />}
      {isDone && (
        <span className={styles.checkmark} aria-hidden="true">
          ✓
        </span>
      )}
      {isFailed && (
        <span className={styles.failGlyph} aria-hidden="true">
          ⌖
        </span>
      )}
      <span className={styles.label}>{item.label}</span>
      {item.detail && <span className={styles.detail}>{item.detail}</span>}
      {item.progress && item.progress.total > 0 && (
        <span
          className={styles.bar}
          style={{
            ["--status-strip-progress" as string]: `${
              (item.progress.value / item.progress.total) * 100
            }%`,
          }}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
