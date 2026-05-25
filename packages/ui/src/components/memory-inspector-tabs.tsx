import type { ConceptId, ConceptMastery, Misconception, MisconceptionId } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useConfiguratorActions } from "../hooks/use-configurator-actions.js";
import { useOptimisticAction } from "../hooks/use-optimistic-action.js";
import { ActionPip } from "./action-pip.js";
import { ConfirmReasonModal } from "./confirm-reason-modal.js";
import styles from "./memory-inspector-tabs.module.css";

type SubTab = "student-model" | "misconceptions" | "audit";

/**
 * Memory inspector with three sub-tabs:
 *  - Student model: concept mastery table with "Reset concept" action.
 *  - Misconceptions: list with "Clear" action.
 *  - Audit: chronological log of configurator_actions.
 *
 * Strategies + Affective + Episodic tabs are placeholders (Phase 14).
 */
export function MemoryInspectorTabs() {
  const client = usePraxisClient();
  const [activeTab, setActiveTab] = useState<SubTab>("student-model");

  // ── Student model ──────────────────────────────────────────────────────────
  const [mastery, setMastery] = useState<Array<[ConceptId, ConceptMastery]>>([]);
  const [masteryLoading, setMasteryLoading] = useState(false);
  const [masteryError, setMasteryError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<ConceptId | null>(null);

  const loadMastery = useCallback(async () => {
    setMasteryLoading(true);
    setMasteryError(null);
    try {
      const model = await client.memory.studentModel();
      setMastery(Array.from(model.conceptMastery.entries()));
    } catch (err) {
      setMasteryError(err instanceof Error ? err.message : String(err));
    } finally {
      setMasteryLoading(false);
    }
  }, [client]);

  // ── Misconceptions ─────────────────────────────────────────────────────────
  const [misconceptions, setMisconceptions] = useState<Misconception[]>([]);
  const [miscLoading, setMiscLoading] = useState(false);
  const [miscError, setMiscError] = useState<string | null>(null);
  const [clearTarget, setClearTarget] = useState<MisconceptionId | null>(null);

  const loadMisconceptions = useCallback(async () => {
    setMiscLoading(true);
    setMiscError(null);
    try {
      const data = await client.memory.misconceptions();
      setMisconceptions(data);
    } catch (err) {
      setMiscError(err instanceof Error ? err.message : String(err));
    } finally {
      setMiscLoading(false);
    }
  }, [client]);

  // ── Audit log ──────────────────────────────────────────────────────────────
  const {
    actions: auditActions,
    loading: auditLoading,
    error: auditError,
  } = useConfiguratorActions({ limit: 100 });

  useEffect(() => {
    loadMastery();
    loadMisconceptions();
  }, [loadMastery, loadMisconceptions]);

  // ── Mutation actions ─────────────────────────────────────────────────────
  // resetConcept and clearMisconception flow through ConfirmReasonModal.
  // Judgment call: ConfirmReasonModal owns submit/error/onClose UX. We use
  // useOptimisticAction here so we can show a pip and failure popover inside
  // the modal body if something goes wrong after submission.
  //
  // studentModel and misconceptions reads (lines 32, 51) stay as useCallback /
  // useEffect — they're pure data fetches, not mutations, so no action hook
  // is needed. useResource would also work but the cancellation pattern here
  // is equivalent.

  const resetAction = useOptimisticAction<{ conceptId: ConceptId; reason: string }>({
    dispatch: async (params) => {
      await client.author.resetConcept(params);
      setResetTarget(null);
      await loadMastery();
    },
  });

  const clearAction = useOptimisticAction<{ misconceptionId: MisconceptionId; reason: string }>({
    dispatch: async (params) => {
      await client.author.clearMisconception(params);
      setClearTarget(null);
      await loadMisconceptions();
    },
  });

  const handleResetConcept = async (reason: string) => {
    if (!resetTarget) return;
    // Fire and forget the useOptimisticAction; ConfirmReasonModal awaits this
    // Promise. Since trigger() returns void and we return immediately, the modal
    // closes optimistically. The pip on the Reset button shows the async state.
    resetAction.trigger({ conceptId: resetTarget, reason });
  };

  const handleClearMisconception = async (reason: string) => {
    if (!clearTarget) return;
    clearAction.trigger({ misconceptionId: clearTarget, reason });
  };

  return (
    <div className={styles.container}>
      <div className={styles.tabBar}>
        {(["student-model", "misconceptions", "audit"] as SubTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tabBtn} ${activeTab === tab ? styles.active : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "student-model" && "Student Model"}
            {tab === "misconceptions" && "Misconceptions"}
            {tab === "audit" && "Audit Log"}
          </button>
        ))}
        <span className={styles.comingSoon}>Strategies · Affective · Episodic — Phase 14</span>
      </div>

      <div className={styles.tabContent}>
        {activeTab === "student-model" && (
          <StudentModelTab
            mastery={mastery}
            loading={masteryLoading}
            error={masteryError}
            onReset={(conceptId) => setResetTarget(conceptId)}
            resetActionState={resetAction.state}
            resetTarget={resetTarget}
          />
        )}
        {activeTab === "misconceptions" && (
          <MisconceptionsTab
            misconceptions={misconceptions}
            loading={miscLoading}
            error={miscError}
            onClear={(id) => setClearTarget(id)}
            clearActionState={clearAction.state}
            clearTarget={clearTarget}
          />
        )}
        {activeTab === "audit" && (
          <AuditTab actions={auditActions} loading={auditLoading} error={auditError} />
        )}
      </div>

      {resetTarget && (
        <ConfirmReasonModal
          title="Reset concept mastery"
          description={`Reset mastery for concept "${resetTarget}" to initial state. This cannot be undone.`}
          reasonLabel="Reason"
          reasonRequired
          confirmLabel="Reset"
          onConfirm={handleResetConcept}
          onClose={() => setResetTarget(null)}
        />
      )}

      {clearTarget && (
        <ConfirmReasonModal
          title="Clear misconception"
          description="Mark this misconception as manually cleared. Provide a reason for the audit log."
          reasonLabel="Reason"
          reasonRequired
          confirmLabel="Clear"
          onConfirm={handleClearMisconception}
          onClose={() => setClearTarget(null)}
        />
      )}
    </div>
  );
}

// ── Sub-tab components ────────────────────────────────────────────────────────

function StudentModelTab({
  mastery,
  loading,
  error,
  onReset,
  resetActionState,
  resetTarget,
}: {
  mastery: Array<[ConceptId, ConceptMastery]>;
  loading: boolean;
  error: string | null;
  onReset: (conceptId: ConceptId) => void;
  /** State of the in-flight resetConcept action (for pip on the trigger row). */
  resetActionState?: import("../hooks/use-optimistic-action.js").ActionState;
  /** The concept currently targeted by the pending reset, if any. */
  resetTarget?: ConceptId | null;
}) {
  if (loading) return <p className={styles.status}>Loading mastery data…</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (mastery.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyPrimary}>No mastery data yet.</p>
        <p className={styles.emptyHint}>Start a teach session to begin tracking concept mastery.</p>
      </div>
    );
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Concept</th>
          <th>Mastery (pKnown)</th>
          <th>Last practiced</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {mastery.map(([conceptId, cm]) => {
          const isThisRowActive = resetTarget === conceptId;
          const pipState = isThisRowActive && resetActionState ? resetActionState : "idle";
          return (
            <tr key={conceptId}>
              <td className={styles.conceptId}>{conceptId}</td>
              <td>
                <span className={styles.masteryBar}>
                  <span
                    className={styles.masteryFill}
                    style={{ width: `${Math.round(cm.pKnown * 100)}%` }}
                  />
                </span>
                {Math.round(cm.pKnown * 100)}%
              </td>
              <td>
                {cm.lastPracticedAt ? new Date(cm.lastPracticedAt).toLocaleDateString() : "Never"}
              </td>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <button
                    type="button"
                    className={styles.resetBtn}
                    onClick={() => onReset(conceptId)}
                    title="Reset concept mastery to initial state"
                  >
                    Reset
                  </button>
                  <ActionPip state={pipState} />
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MisconceptionsTab({
  misconceptions,
  loading,
  error,
  onClear,
  clearActionState,
  clearTarget,
}: {
  misconceptions: Misconception[];
  loading: boolean;
  error: string | null;
  onClear: (id: MisconceptionId) => void;
  /** State of the in-flight clearMisconception action (for pip on the trigger row). */
  clearActionState?: import("../hooks/use-optimistic-action.js").ActionState;
  /** The misconception currently targeted by the pending clear, if any. */
  clearTarget?: MisconceptionId | null;
}) {
  if (loading) return <p className={styles.status}>Loading misconceptions…</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (misconceptions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyPrimary}>No misconceptions recorded.</p>
        <p className={styles.emptyHint}>
          Misconceptions are detected automatically during sessions.
        </p>
      </div>
    );
  }

  return (
    <ul className={styles.miscList}>
      {misconceptions.map((m) => {
        const isThisRowActive = clearTarget === m.id;
        const pipState = isThisRowActive && clearActionState ? clearActionState : "idle";
        return (
          <li key={m.id} className={styles.miscItem}>
            <div className={styles.miscHeader}>
              <span className={styles.miscConcept}>{m.conceptId}</span>
              <span
                className={`${styles.miscStatus} ${m.status === "active" ? styles.statusActive : styles.statusCleared}`}
              >
                {m.status}
              </span>
            </div>
            <p className={styles.miscDesc}>{m.description}</p>
            {m.status === "active" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <button type="button" className={styles.clearBtn} onClick={() => onClear(m.id)}>
                  Mark cleared
                </button>
                <ActionPip state={pipState} />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AuditTab({
  actions,
  loading,
  error,
}: {
  actions: import("@praxis/core/types").ConfiguratorActionRow[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <p className={styles.status}>Loading audit log…</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (actions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyPrimary}>No configurator actions yet.</p>
        <p className={styles.emptyHint}>
          Edits to courses, lessons, gates, prompts, and memory appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className={styles.auditList}>
      {actions.map((row) => (
        <li key={row.id} className={styles.auditItem}>
          <span className={styles.auditKind}>{row.action.kind}</span>
          <span className={styles.auditTs}>{new Date(row.ts).toLocaleString()}</span>
          {"reason" in row.action && row.action.reason && (
            <span className={styles.auditReason}>{row.action.reason}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
