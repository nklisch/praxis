import type { Gate, GateId, SuccessCriteria } from "@praxis/core/types";
import { type FormEvent, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useOptimisticAction } from "../hooks/use-optimistic-action.js";
import { COPY } from "../lib/copy.js";
import { ActionPip } from "./action-pip.js";
import { ConfirmReasonModal } from "./confirm-reason-modal.js";
import { FailurePopover } from "./failure-popover.js";
import styles from "./gate-inspector.module.css";

export interface GateInspectorProps {
  gate: Gate;
  /**
   * Full gates list (for prerequisite lookup). When present, each prereq id
   * in the rendered list is resolved to its gate's `summaryText`; the id
   * itself becomes muted secondary text. Falls back to raw id rendering
   * when omitted.
   */
  allGates?: ReadonlyArray<Gate>;
  onSaved: (gate: Gate) => void;
  onDeleted: (gateId: GateId) => void;
  onClose: () => void;
  /**
   * Called when the user edits the mastery threshold field (before saving).
   * Passes the new value (0–1) so the parent can record the pending score for
   * the inspector strip's before/after display, and mark the edge dirty.
   */
  onThresholdEdit?: (gateId: GateId, newMinScore: number) => void;
}

function formatCriteria(criteria: SuccessCriteria): string {
  switch (criteria.kind) {
    case "mastery-threshold":
      return `Mastery ≥ ${Math.round(criteria.minScore * 100)}% on ${criteria.conceptIds.length} concept(s)`;
    case "exam-pass":
      return `Exam pass ≥ ${Math.round(criteria.minScore * 100)}%`;
    case "and":
      return `All of: ${criteria.criteria.map(formatCriteria).join("; ")}`;
    case "or":
      return `Any of: ${criteria.criteria.map(formatCriteria).join("; ")}`;
  }
}

function formatState(gate: Gate): string {
  switch (gate.state.kind) {
    case "locked":
      return `Locked (${gate.state.missingPrerequisites.length} missing prerequisite(s))`;
    case "unlocked":
      return `Unlocked at ${new Date(gate.state.unlockedAt).toLocaleString()}`;
    case "overridden":
      return `Overridden by ${gate.state.by} — "${gate.state.reason}"`;
  }
}

function parseThresholdPercent(value: string): number | null {
  if (value.trim() === "") return null;

  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;

  return percent / 100;
}

/**
 * Inspector panel for a single gate in the Gates tab.
 *
 * Shows: gate state, success criteria, prerequisites.
 * Actions: Save (update criteria), Override (with reason), Delete.
 */
export function GateInspector({
  gate,
  allGates,
  onSaved,
  onDeleted,
  onClose,
  onThresholdEdit,
}: GateInspectorProps) {
  const client = usePraxisClient();

  const prereqLookup = (pid: string): { summary: string; id: string } => {
    const found = allGates?.find((g) => g.id === pid);
    if (!found) return { summary: pid, id: pid };
    return { summary: formatCriteria(found.successCriteria), id: pid };
  };

  // Editable: minScore for mastery-threshold criteria (simple v1 — more complex editing via agent)
  const [minScore, setMinScore] = useState<string>(
    gate.successCriteria.kind === "mastery-threshold"
      ? String(Math.round(gate.successCriteria.minScore * 100))
      : "",
  );
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [minScoreError, setMinScoreError] = useState<string | null>(null);

  const canEditMinScore = gate.successCriteria.kind === "mastery-threshold";

  // ── updateGate action ────────────────────────────────────────────────────
  // Optimistic dispatch: Save threshold button stays interactive; pip shows state.
  const saveAction = useOptimisticAction<{
    gateId: GateId;
    patch: { successCriteria: SuccessCriteria };
  }>({
    dispatch: async (params) => {
      const updated = await client.author.updateGate(params);
      onSaved(updated);
    },
  });

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (!canEditMinScore) return;
    const score = parseThresholdPercent(minScore);
    if (score === null) {
      setMinScoreError("Enter a mastery threshold from 0 to 100.");
      return;
    }
    setMinScoreError(null);
    saveAction.trigger({
      gateId: gate.id,
      patch: {
        successCriteria: {
          ...gate.successCriteria,
          minScore: score,
        } as SuccessCriteria,
      },
    });
  };

  // ── overrideGate / deleteGate ────────────────────────────────────────────
  // Both actions go through ConfirmReasonModal which owns submit / error UX.
  // Judgment call: keep as raw async handlers so the modal's submitting state
  // and onClose()-on-success contract are preserved without a competing
  // state machine. ConfirmReasonModal.onConfirm expects Promise<void>.
  const handleOverride = async (reason: string) => {
    const updated = await client.author.overrideGate({ gateId: gate.id, reason });
    onSaved(updated);
  };

  const handleDelete = async (reason: string) => {
    if (reason) {
      await client.author.deleteGate({ gateId: gate.id, reason });
    } else {
      await client.author.deleteGate({ gateId: gate.id });
    }
    onDeleted(gate.id);
  };

  const isSaving = saveAction.state === "pending" || saveAction.state === "retrying";

  return (
    <div className={styles.inspector}>
      <div className={styles.header}>
        <h3 className={styles.title}>Gate Inspector</h3>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close inspector"
        >
          ✕
        </button>
      </div>

      <div className={styles.body}>
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>State</h4>
          <p className={styles.stateText}>{formatState(gate)}</p>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Success Criteria</h4>
          <p className={styles.criteriaText}>{formatCriteria(gate.successCriteria)}</p>
        </section>

        {canEditMinScore && (
          <form onSubmit={handleSave} className={styles.form}>
            <label className={styles.label}>
              Mastery threshold (%)
              <input
                type="number"
                className={styles.input}
                value={minScore}
                onChange={(e) => {
                  const next = e.target.value;
                  setMinScore(next);
                  const parsed = parseThresholdPercent(next);
                  setMinScoreError(
                    parsed === null ? "Enter a mastery threshold from 0 to 100." : null,
                  );
                  if (parsed !== null) onThresholdEdit?.(gate.id, parsed);
                }}
                min={0}
                max={100}
                step={5}
                aria-invalid={minScoreError !== null}
                aria-describedby={minScoreError ? "gate-threshold-error" : undefined}
              />
            </label>
            {minScoreError && (
              <p id="gate-threshold-error" className={styles.error} role="alert">
                {minScoreError}
              </p>
            )}

            <div
              style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <button type="submit" className={styles.saveBtn} aria-label="Save threshold">
                {isSaving ? "Saving…" : "Save threshold"}
              </button>
              <ActionPip state={saveAction.state} />
              {saveAction.state === "failed" && (
                <FailurePopover
                  reason={saveAction.errorReason}
                  actions={[
                    {
                      label: COPY.actionPip.retryLabel,
                      onClick: saveAction.retry,
                      variant: "primary",
                    },
                    { label: COPY.actionPip.dismissLabel, onClick: saveAction.dismiss },
                  ]}
                />
              )}
            </div>
          </form>
        )}

        {gate.prerequisites.length > 0 && (
          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>Prerequisites</h4>
            <ul className={styles.prereqList}>
              {gate.prerequisites.map((pid) => {
                const { summary, id } = prereqLookup(pid);
                return (
                  <li key={pid} className={styles.prereqItem}>
                    <span className={styles.prereqSummary}>{summary}</span>
                    <span className={styles.prereqId} title={id}>
                      {id}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className={styles.dangerSection}>
          <h4 className={styles.sectionTitle}>Actions</h4>
          <div className={styles.dangerActions}>
            <button
              type="button"
              className={styles.overrideBtn}
              onClick={() => setShowOverrideModal(true)}
              disabled={gate.state.kind === "overridden"}
            >
              Override gate
            </button>
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => setShowDeleteModal(true)}
            >
              Delete gate
            </button>
          </div>
        </section>
      </div>

      {showOverrideModal && (
        <ConfirmReasonModal
          title="Override gate"
          description="Manually mark this gate as passed. Provide a reason for the audit log."
          reasonLabel="Reason"
          reasonRequired
          confirmLabel="Override"
          onConfirm={handleOverride}
          onClose={() => setShowOverrideModal(false)}
        />
      )}

      {showDeleteModal && (
        <ConfirmReasonModal
          title="Delete gate"
          description={`Delete gate ${gate.id}? This cannot be undone.`}
          reasonLabel="Reason (optional)"
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}
