/**
 * Bootstrap modality tab body.
 *
 * Two-pane layout: chat on the left (~60%) for tutor conversation; a draft
 * course outline on the right (~40%) that updates live as the course-design sub-agent
 * builds units, lessons, concepts, edges, and assessments.
 *
 * The right pane subscribes to `client.drafts.events()` via the `useDrafts`
 * hook. The bootstrap service emits a `started` event from `initDraft` and
 * an `updated` event from every mutator, so the outline reflects each tool
 * call as it lands rather than waiting for `course.show_draft` to fire.
 *
 * The outline header also exposes the user's tool-call budget for the course-design sub-agent.
 * Edits persist via ConfigService and are read server-side at the
 * start of the next exploration — no restart required.
 */
import type { TabSummary } from "@praxis/core/types";
import { type ChangeEvent, type JSX, useEffect, useState } from "react";
import {
  BOOTSTRAP_BUDGET_MAX,
  BOOTSTRAP_BUDGET_MIN,
  useBootstrapBudget,
} from "../hooks/use-bootstrap-budget.js";
import { useCurrentSubAgent } from "../hooks/use-current-sub-agent.js";
import { useDrafts } from "../hooks/use-drafts.js";
import styles from "./bootstrap-tab-body.module.css";
import { TeachChatTabBody } from "./chat-tab-body.js";
import { DraftCard } from "./draft-card.js";
import { SubAgentPanel } from "./sub-agent-panel.js";

export interface BootstrapTabBodyProps {
  tab: TabSummary;
}

/**
 * Split-pane bootstrap body: chat on left, live outline on right. The outline
 * renders the most recently mutated draft via `<DraftCard>`. While the
 * explorer hasn't yet called `draft_init`, the placeholder copy persists.
 */
export function BootstrapTabBody({ tab }: BootstrapTabBodyProps): JSX.Element {
  const { current } = useDrafts();
  const currentSubAgent = useCurrentSubAgent();

  return (
    <div className={styles.container}>
      {/* Left: existing chat body (reused in full) */}
      <div className={styles.chatPane}>
        <TeachChatTabBody tab={tab} />
      </div>

      {/* Right: live draft outline — driven by the bootstrap-drafts stream. */}
      <aside className={styles.outlinePane} aria-label="Course outline">
        <div className={styles.outlineHeader}>
          <span className={styles.outlineTitle}>course outline</span>
          <BudgetField />
        </div>
        {current ? (
          <DraftCard proposed={current.proposed} />
        ) : (
          <div className={styles.outlinePlaceholder}>
            <p>the outline will appear here as the tutor builds the course.</p>
          </div>
        )}
        {/* Sub-agent transcript panel — visible only when an exploration is running.
            Default-hidden; the user toggles via the button inside SubAgentPanel. */}
        <SubAgentPanel parentCallId={currentSubAgent} />
      </aside>
    </div>
  );
}

/**
 * Editable numeric input for the course-design sub-agent tool-call budget. Local
 * input state lets the user type freely; commits on blur or Enter. Clamped
 * client-side and again server-side by Zod.
 */
function BudgetField(): JSX.Element {
  const { maxSteps, saving, setMaxSteps } = useBootstrapBudget();
  const [draft, setDraft] = useState<string>("");

  // Sync local draft string when the loaded value arrives or changes externally.
  useEffect(() => {
    if (maxSteps !== null) setDraft(String(maxSteps));
  }, [maxSteps]);

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isFinite(parsed)) {
      void setMaxSteps(parsed);
    } else if (maxSteps !== null) {
      // Reset to the last good value if the user typed garbage.
      setDraft(String(maxSteps));
    }
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
  };

  return (
    <label className={styles.budgetField}>
      budget
      <input
        type="number"
        className={styles.budgetInput}
        min={BOOTSTRAP_BUDGET_MIN}
        max={BOOTSTRAP_BUDGET_MAX}
        step={1}
        value={draft}
        disabled={maxSteps === null || saving}
        onChange={onChange}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label="Course-design budget"
        title={`Tool-call budget for the course-design sub-agent (${BOOTSTRAP_BUDGET_MIN}–${BOOTSTRAP_BUDGET_MAX} steps).`}
      />
      steps
    </label>
  );
}
