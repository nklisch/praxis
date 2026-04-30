import type { ConceptId, Lesson, LessonId } from "@praxis/core/types";
import { type FormEvent, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { ConfirmReasonModal } from "./confirm-reason-modal.js";
import styles from "./lesson-editor.module.css";

export interface LessonEditorProps {
  lesson: Lesson;
  availableConcepts: Array<{ id: string; name: string }>;
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
  const [conceptIdsText, setConceptIdsText] = useState(lesson.conceptIds.join(", "));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const parsedConceptIds = conceptIdsText
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean) as ConceptId[];

      const updated = await client.author.updateLesson({
        lessonId: lesson.id,
        patch: {
          title: title.trim() || lesson.title,
          conceptIds: parsedConceptIds,
          ...(estimatedMinutes.trim() !== "" && {
            estimatedMinutes: Number(estimatedMinutes),
          }),
        },
      });
      onSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

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
    conceptIdsText !== lesson.conceptIds.join(", ");

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
              disabled={saving}
              required
            />
          </label>
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
              disabled={saving}
            />
          </label>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>
            Concept IDs (comma-separated)
            <textarea
              className={styles.textarea}
              value={conceptIdsText}
              onChange={(e) => setConceptIdsText(e.target.value)}
              rows={3}
              disabled={saving}
              placeholder="concept-id-1, concept-id-2"
            />
          </label>
          {availableConcepts.length > 0 && (
            <div className={styles.conceptHints}>
              {availableConcepts.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={styles.conceptChip}
                  onClick={() => {
                    const current = conceptIdsText
                      .split(/[,\n]+/)
                      .map((s) => s.trim())
                      .filter(Boolean);
                    if (!current.includes(c.id)) {
                      setConceptIdsText([...current, c.id].join(", "));
                    }
                  }}
                  title={`Add ${c.name}`}
                >
                  + {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {saveError && (
          <p className={styles.error} role="alert">
            {saveError}
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={() => setShowDeleteModal(true)}
            disabled={saving}
          >
            Delete lesson
          </button>
          <button type="submit" className={styles.saveBtn} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save"}
          </button>
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
