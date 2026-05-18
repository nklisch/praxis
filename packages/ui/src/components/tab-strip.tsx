import type { TabId, TabSummary } from "@praxis/core/types";
import type { CSSProperties, JSX } from "react";
import { useParentChildOptional } from "../context/parent-child-context.js";
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
  // Optional — renders in contexts where ParentChildProvider is not mounted
  // (e.g. storybooks, test harnesses). Pill and pulse are suppressed cleanly.
  const parentChild = useParentChildOptional();

  return (
    <div className={styles.strip} role="tablist" aria-label="Open sessions">
      {tabs.map((tab) => {
        // Document tabs have no modeId — getModeMeta handles undefined gracefully.
        const meta = getModeMeta(tab.kind === "session" ? tab.modeId : undefined);
        const isActive = tab.id === activeTabId;

        // ── Parent-child decoration ─────────────────────────────────────────
        // Child pill: shown when this tab's session was spawned from a parent.
        const sessionId = tab.kind === "session" ? tab.sessionId : undefined;
        const parentSessionId =
          sessionId !== undefined ? parentChild?.getParentSessionId(sessionId) : undefined;

        // Resolve the parent mode name for the pill label.
        const parentModeName =
          parentSessionId !== undefined
            ? (() => {
                // We need the parent tab's mode to label the pill.
                // Walk the open tabs to find the parent tab's modeId.
                const parentTab = tabs.find(
                  (t) => t.kind === "session" && t.sessionId === parentSessionId,
                );
                const parentModeId = parentTab?.kind === "session" ? parentTab.modeId : undefined;
                return getModeMeta(parentModeId).name;
              })()
            : undefined;

        // Parent pulse: shown when a child session emits a system_note into
        // this session's stream. The pulseKey increments per event so the
        // element remounts (restarting the CSS keyframe) on rapid-fire notes.
        const pulseKey = sessionId !== undefined ? (parentChild?.getPulseKey(sessionId) ?? 0) : 0;

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

            {/* Child tab: "from {parentMode}" pill */}
            {parentModeName !== undefined && (
              <span className={styles.fromPill}>from {parentModeName}</span>
            )}

            {/* Parent tab: pulse dot when a child session calls back.
                Rendered as a <span> (not a button) to avoid nested-button
                invalid HTML. Click bubbles to the outer tab button which calls
                onSwitch — no stopPropagation needed. */}
            {pulseKey > 0 && (
              <span
                key={`pulse-${pulseKey}`}
                className={styles.pulseDot}
                aria-label="Child session returned a result"
                role="status"
              />
            )}

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
