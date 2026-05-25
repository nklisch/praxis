import type { ConceptId, Lesson, LessonId } from "@praxis/core/types";
import { type FormEvent, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useOptimisticAction } from "../hooks/use-optimistic-action.js";
import { COPY } from "../lib/copy.js";
import { ActionPip } from "./action-pip.js";
import { ConceptPicker } from "./concept-picker.js";
import { ConfirmReasonModal } from "./confirm-reason-modal.js";
import { FailurePopover } from "./failure-popover.js";
import { LessonAssessmentPills } from "./lesson-assessment-pills.js";
import styles from "./lesson-editor.module.css";

export interface LessonEditorProps {
  lesson: Lesson;
  availableConcepts: ReadonlyArray<{
    id: string;
    name: string;
    aliases?: ReadonlyArray<string>;
  }>;
  onSaved: (lesson: Lesson) => void;
  onDeleted: (lessonId: LessonId) => void;
}

/**
 * Editable form for a single lesson.
 *
 * Fields: title, estimatedMinutes, suggestedStrategy.
 * conceptIds: multi-line text box (one per line, comma-separated IDs — v1 simplicity;
 * a proper multi-select requires a full UI library not in scope).
 *
 * Save → client.author.updateLesson
 * Delete → ConfirmReasonModal → client.author.deleteLesson
 */
export function LessonEditor({ lesson, availableConcepts, onSaved, onDeleted }: LessonEditorProps) {
  const client = usePraxisClient();
  const [title, setTitle] = useState(lesson.title);
  const [estimatedMinutes, setEstimatedMinutes] = useState(String(lesson.estimatedMinutes ?? ""));
  const [selectedConceptIds, setSelectedConceptIds] = useState<string[]>(lesson.conceptIds.slice());
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // ── updateLesson action ──────────────────────────────────────────────────
  // Optimistic dispatch: the save button stays interactive during the IPC
  // round-trip. A pip beside it shows pending / success / failed state; failure
  // renders a FailurePopover with retry so the user can recover without
  // re-entering form data (params are captured at trigger-time).
  const saveAction = useOptimisticAction<{
    lessonId: LessonId;
    patch: {
      title: string;
      conceptIds: ConceptId[];
      estimatedMinutes?: number;
    };
  }>({
    dispatch: async (params) => {
      const updated = await client.author.updateLesson(params);
      onSaved(updated);
    },
  });

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    saveAction.trigger({
      lessonId: lesson.id,
      patch: {
        title: title.trim() || lesson.title,
        conceptIds: selectedConceptIds as ConceptId[],
        ...(estimatedMinutes.trim() !== "" && {
          estimatedMinutes: Number(estimatedMinutes),
        }),
      },
    });
  };

  // ── deleteLesson action ──────────────────────────────────────────────────
  // ConfirmReasonModal owns submit / error UI for the destructive confirm flow.
  // Judgment call: ConfirmReasonModal.onConfirm expects Promise<void> and calls
  // onClose() on success, so delete stays as a raw async handler here — the
  // modal's own submitting / error states handle the UX. This preserves the
  // audit-reason collection contract without a competing state machine.
  const handleDelete = async (reason: string) => {
    if (reason) {
      await client.author.deleteLesson({ lessonId: lesson.id, reason });
    } else {
      await client.author.deleteLesson({ lessonId: lesson.id });
    }
    onDeleted(lesson.id);
  };

  const isDirty =
    title !== lesson.title ||
    estimatedMinutes !== String(lesson.estimatedMinutes ?? "") ||
    selectedConceptIds.length !== lesson.conceptIds.length ||
    selectedConceptIds.some((id, idx) => id !== lesson.conceptIds[idx]);

  const isSaving = saveAction.state === "pending" || saveAction.state === "retrying";

  return (
    <div className={styles.editor}>
      <form onSubmit={handleSave} className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>
            Title
            <input
              type="text"
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <LessonAssessmentPills lessonId={lesson.id} />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>
            Estimated minutes
            <input
              type="number"
              className={styles.input}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              min={1}
              max={240}
            />
          </label>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Concepts</span>
          <ConceptPicker
            selectedIds={selectedConceptIds}
            options={availableConcepts}
            onChange={setSelectedConceptIds}
            placeholder="Search concepts by name…"
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={() => setShowDeleteModal(true)}
          >
            Delete lesson
          </button>
          <div
            style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={!isDirty}
              aria-label="Save lesson"
            >
              {isSaving ? "Saving…" : "Save"}
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
        </div>
      </form>

      {showDeleteModal && (
        <ConfirmReasonModal
          title="Delete lesson"
          description={`Are you sure you want to delete "${lesson.title}"? This will also remove associated progress data.`}
          reasonLabel="Reason (optional)"
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}
