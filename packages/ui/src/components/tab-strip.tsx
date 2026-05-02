import type { TabId, TabSummary } from "@praxis/core/types";
import type { CSSProperties, JSX } from "react";
import { getModeMeta } from "./mode-meta.js";
import styles from "./tab-strip.module.css";

export interface TabStripProps {
  tabs: ReadonlyArray<TabSummary>;
  activeTabId: TabId | null;
  onSwitch: (tabId: TabId) => void;
  onClose: (tabId: TabId) => void;
  /** Called when the user clicks the "+" affordance. Parent shows the new-tab picker. */
  onNew: () => void;
}

export function TabStrip({
  tabs,
  activeTabId,
  onSwitch,
  onClose,
  onNew,
}: TabStripProps): JSX.Element {
  return (
    <div className={styles.strip} role="tablist" aria-label="Open sessions">
      {tabs.map((tab) => {
        const meta = getModeMeta(tab.modeId);
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`${styles.tab}${isActive ? ` ${styles.active}` : ""}`}
            style={{ "--mode-tint": meta.tint } as CSSProperties}
            onClick={() => onSwitch(tab.id)}
            onMouseDown={(e) => {
              // Middle-click closes the tab
              if (e.button === 1) {
                e.preventDefault();
                onClose(tab.id);
              }
            }}
            title={tab.title}
          >
            <span className={styles.ornament} aria-hidden="true">
              {meta.ornament}
            </span>
            <span className={styles.title}>{tab.title}</span>
            <button
              type="button"
              className={styles.close}
              aria-label={`Close ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
            >
              ×
            </button>
          </button>
        );
      })}
      <button
        type="button"
        className={styles.newButton}
        aria-label="Open new session"
        onClick={onNew}
      >
        +
      </button>
    </div>
  );
}
