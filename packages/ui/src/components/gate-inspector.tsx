import type { Gate, GateId, SuccessCriteria } from "@praxis/core/types";
import { type FormEvent, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { ConfirmReasonModal } from "./confirm-reason-modal.js";
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
   * The parent can use this to mark the corresponding edge dirty immediately,
   * so the gate graph shows a warning-coloured edge for pending changes.
   */
  onThresholdEdit?: (gateId: GateId) => void;
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const canEditMinScore = gate.successCriteria.kind === "mastery-threshold";

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEditMinScore) return;
    setSaving(true);
    setSaveError(null);
    try {
      const score = Number(minScore) / 100;
      const updated = await client.author.updateGate({
        gateId: gate.id,
        patch: {
          successCriteria: {
            ...gate.successCriteria,
            minScore: score,
          } as SuccessCriteria,
        },
      });
      onSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

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
                setMinScore(e.target.value);
                onThresholdEdit?.(gate.id);
              }}
                min={0}
                max={100}
                step={5}
                disabled={saving}
              />
            </label>

            {saveError && (
              <p className={styles.error} role="alert">
                {saveError}
              </p>
            )}

            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? "Saving…" : "Save threshold"}
            </button>
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
              disabled={saving || gate.state.kind === "overridden"}
            >
              Override gate
            </button>
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => setShowDeleteModal(true)}
              disabled={saving}
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
