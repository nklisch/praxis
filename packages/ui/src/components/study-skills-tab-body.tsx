import type { SessionTabSummary } from "@praxis/core/types";
import type { JSX } from "react";
import { TeachChatTabBody } from "./chat-tab-body.js";
import styles from "./study-skills-tab-body.module.css";

export interface StudySkillsTabBodyProps {
  tab: SessionTabSummary;
}

/**
 * Study-skills mode tab body (Phase 18).
 *
 * Wraps TeachChatTabBody with a small header chip that signals the
 * coach context. The full chat interface (message log, composer, mode
 * header) comes from TeachChatTabBody — this wrapper adds the
 * study-skills visual accent only.
 *
 * Follows the tab-body-isolation pattern: this component mounts and
 * stays mounted while its tab is open; visibility (display:none) is
 * managed by the parent ChatRoute, not here.
 */
export function StudySkillsTabBody({ tab }: StudySkillsTabBodyProps): JSX.Element {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.chip}>study skills</span>
      </div>
      <div className={styles.body}>
        <TeachChatTabBody tab={tab} />
      </div>
    </div>
  );
}
