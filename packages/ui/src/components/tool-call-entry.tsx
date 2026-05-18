import type { Timestamp } from "@praxis/core/types";
import type { JSX } from "react";
import { useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { Modal } from "./modal.js";
import styles from "./tool-call-entry.module.css";

export type ToolCallVerdict = "ok" | "error" | "running";

export interface ToolCallEntryProps {
  /** Tool name (e.g. "lesson.create"). */
  name: string;
  /** Human-readable one-line summary of what the tool did. */
  summary: string;
  /** Verdict state — drives glyph and colour. */
  verdict: ToolCallVerdict;
  /**
   * Audit-log action id from `configurator_actions`. When present, the entry
   * surfaces a ↶ revert button that calls `restoreAction({ actionId })`.
   * Absent for tool calls that are not snapshottable mutations (read-only
   * tools, memory.export, etc.).
   */
  actionId?: string;
  /**
   * Whether this action's snapshot has already been consumed by a previous
   * `restoreAction` call. When set (and `actionId` is set), shows a muted
   * "↶ restored" label instead of the revert button.
   *
   * The parent (`AuthoringChatPane`) derives this from `listConfiguratorActions`
   * and passes it down; the component updates its own local state after a
   * successful restore so the UI reacts immediately without waiting for a
   * parent re-fetch.
   */
  restoredAt?: Timestamp | null;
}

/** Unicode glyphs for each verdict state. */
const VERDICT_GLYPH: Record<ToolCallVerdict, string> = {
  ok: "✓",
  error: "⊘",
  running: "…",
};

/**
 * One-line tool-call render unit for the authoring chat surfaces
 * (configure and course-create).
 *
 * Renders: verdict glyph · tool name · summary text · ↶ revert (when available).
 *
 * When `actionId` is provided and the action has not been restored, shows a
 * ↶ revert button. Clicking it opens a confirmation `<Modal>`; confirming calls
 * `praxisClient.author.restoreAction({ actionId })` and surfaces the result
 * inline.
 *
 * When already restored (either from `restoredAt` prop or after a successful
 * in-session restore), shows a muted "↶ restored" label.
 *
 * This is the authoring-specific variant of the tool disclosure — it does NOT
 * expand/collapse (that affordance lives in `<ToolCallDisclosure>` for
 * teach-mode). Authoring tool calls are mutations described by a summary, with
 * the revert affordance as the primary interaction.
 */
export function ToolCallEntry(props: ToolCallEntryProps): JSX.Element {
  const { name, summary, verdict, actionId, restoredAt } = props;
  const client = usePraxisClient();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revertState, setRevertState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [revertError, setRevertError] = useState<string | null>(null);

  // Once the component records a successful restore, it shows the restored
  // label even if the parent hasn't refreshed its actions list yet.
  const [localRestored, setLocalRestored] = useState(false);

  const isRestored = localRestored || (restoredAt != null && restoredAt !== undefined);

  const glyphClass =
    verdict === "ok"
      ? styles.glyphOk
      : verdict === "error"
        ? styles.glyphError
        : styles.glyphRunning;

  const handleConfirmRevert = async () => {
    if (!actionId) return;
    setConfirmOpen(false);
    setRevertState("loading");
    setRevertError(null);
    try {
      const result = await client.author.restoreAction({ actionId });
      if (result.ok) {
        setRevertState("done");
        setLocalRestored(true);
      } else {
        setRevertState("error");
        setRevertError(
          result.reason === "already_restored"
            ? "Already restored."
            : result.reason === "no_snapshot"
              ? "No snapshot available for this action."
              : result.reason === "schema_drift"
                ? "Snapshot schema has changed — cannot restore."
                : "Action not found.",
        );
      }
    } catch (err) {
      setRevertState("error");
      setRevertError(err instanceof Error ? err.message : "Restore failed.");
    }
  };

  return (
    <>
      <div className={styles.entry} data-verdict={verdict}>
        <span className={`${styles.glyph} ${glyphClass}`} aria-hidden="true">
          {VERDICT_GLYPH[verdict]}
        </span>
        <span className={styles.name}>{name}</span>
        <span className={styles.summary}>{summary}</span>

        {actionId != null && (
          <span className={styles.revertZone}>
            {isRestored ? (
              <span className={styles.restoredLabel}>↶ restored</span>
            ) : revertState === "loading" ? (
              <span className={styles.revertLoading}>↶…</span>
            ) : revertState === "done" ? (
              // Should be covered by localRestored above, but keep as fallback.
              <span className={styles.restoredLabel}>↶ restored</span>
            ) : (
              <button
                type="button"
                className={styles.revertButton}
                onClick={() => setConfirmOpen(true)}
                aria-label={`Revert ${name}`}
              >
                ↶ revert
              </button>
            )}
          </span>
        )}

        {revertState === "error" && revertError != null && (
          <span className={styles.revertErrorText} role="alert">
            {revertError}
          </span>
        )}
      </div>

      {confirmOpen && (
        <Modal onClose={() => setConfirmOpen(false)} ariaLabel="Confirm revert" maxWidth="360px">
          <div className={styles.confirmBody}>
            <p className={styles.confirmHeading}>Revert this action?</p>
            <p className={styles.confirmDesc}>
              <em>{name}</em> — {summary}
            </p>
            <p className={styles.confirmHint}>
              This will restore the affected record to its state before this action. The revert
              itself is logged so you can undo it.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={() => void handleConfirmRevert()}
              >
                Revert
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
