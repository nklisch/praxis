import { MemoryInspectorTabs } from "../../components/memory-inspector-tabs.js";
import styles from "./memory-tab.module.css";

/**
 * Memory tab — wrapper around MemoryInspectorTabs.
 *
 * Sub-tabs: Student model / Misconceptions / Audit
 * Strategies + Affective + Episodic are "Phase 14" placeholders in MemoryInspectorTabs.
 *
 * No RouteHeader: this is a tab panel inside <ConfigureRoute>, not a standalone route.
 * The parent route owns the header (configure.tsx renders <RouteHeader>).
 */
export function MemoryTab() {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h2 className={styles.title}>Student Memory</h2>
        <p className={styles.description}>
          Inspect and manage the student's mastery model, misconceptions, and audit log. All edits
          are logged to the configurator audit trail.
        </p>
      </header>

      <div className={styles.content}>
        <MemoryInspectorTabs />
      </div>
    </div>
  );
}
