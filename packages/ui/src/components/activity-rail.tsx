import type { ActivityItem } from "@praxis/core/types";
import { useActivity } from "../hooks/use-activity.js";
import styles from "./activity-rail.module.css";

/**
 * Ambient progress surface — a thin rail anchored to the bottom of the
 * app chrome. Renders one editorial line per visible activity. Returns
 * `null` when there is nothing to show, reserving no chrome space.
 *
 * Slotted ONCE in the root layout (router.tsx's rootRoute component).
 * Do not render in route bodies; the rail spans every route.
 */
export function ActivityRail() {
  const { items, dismiss } = useActivity();
  if (items.length === 0) return null;

  return (
    <aside className={styles.rail} aria-label="Activity">
      <ul className={styles.list}>
        {items.map((item) => (
          <ActivityRow key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </ul>
    </aside>
  );
}

interface ActivityRowProps {
  item: ActivityItem;
  onDismiss: (id: string) => void;
}

function ActivityRow({ item, onDismiss }: ActivityRowProps) {
  const cls = [
    styles.row,
    item.status === "done" && styles.rowDone,
    item.status === "failed" && styles.rowFailed,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={cls}>
      <span className={styles.glyph} aria-hidden="true">
        {item.status === "failed" ? "⌖" : item.status === "done" ? "·" : "°"}
      </span>
      <span className={styles.label}>{item.label}</span>
      {item.detail && <span className={styles.detail}>{item.detail}</span>}
      {item.progress && item.progress.total > 0 && (
        <span
          className={styles.bar}
          style={{
            // hairline progress bar (no numeric percent — anti-numeric per VISION)
            ["--praxis-activity-progress" as string]: `${
              (item.progress.value / item.progress.total) * 100
            }%`,
          }}
          aria-hidden="true"
        />
      )}
      {item.status === "failed" && (
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => onDismiss(item.id)}
          aria-label={`Dismiss ${item.label}`}
        >
          ×
        </button>
      )}
    </li>
  );
}
