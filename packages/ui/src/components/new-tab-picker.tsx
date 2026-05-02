import type { SessionId, TabId, TabSummary } from "@praxis/core/types";
import { type FormEvent, type JSX, useCallback, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "../hooks/use-resource.js";
import { Modal } from "./modal.js";
import styles from "./new-tab-picker.module.css";

/** Modes available to open from the picker (ordered for display). */
const PICKER_MODES = ["teach", "bootstrap", "quiz", "homework", "exam", "configure"] as const;
type PickerMode = (typeof PICKER_MODES)[number];

/** Modes that accept a course context. */
const COURSE_MODES: ReadonlySet<PickerMode> = new Set([
  "teach",
  "bootstrap",
  "quiz",
  "homework",
  "exam",
]);

export interface NewTabPickerProps {
  onClose: () => void;
  /**
   * Open-tab callback from the parent's `useTabs()` hook. Using the parent's
   * hook (rather than calling `client.tabs.open` directly) keeps the parent's
   * tab list and active-tab state in sync — without this the new tab would
   * exist on the server but the workspace shell wouldn't render its body.
   */
  openTab: (input: { sessionId: SessionId; courseTitle?: string }) => Promise<TabSummary>;
  /** Called after the new tab is opened, with its TabId. Parent navigates to it. */
  onOpened: (tabId: TabId) => void;
}

/**
 * Modal picker for opening a new session tab.
 */
export function NewTabPicker({ onClose, openTab, onOpened }: NewTabPickerProps): JSX.Element {
  const client = usePraxisClient();
  const [modeId, setModeId] = useState<PickerMode>("teach");
  const [courseId, setCourseId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load courses for the dropdown
  const coursesLoader = useCallback(() => client.artifacts.courses(), [client]);
  const { data: courses = [], loading: coursesLoading } = useResource(coursesLoader);

  const showCourse = COURSE_MODES.has(modeId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const handle = await client.session.start({
        modeId,
        ...(showCourse && courseId
          ? { courseId: courseId as import("@praxis/core/types").CourseId }
          : {}),
      });

      const selectedCourse = courses.find((c) => c.courseId === courseId);
      const tab = await openTab({
        sessionId: handle.sessionId,
        ...(selectedCourse ? { courseTitle: selectedCourse.title } : {}),
      });

      onOpened(tab.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} ariaLabel="Open new session" maxWidth="480px">
      <span className={styles.ornament} aria-hidden="true">
        +
      </span>
      <span className={styles.kicker}>NEW SESSION</span>
      <h2 className={styles.title}>open a session</h2>
      <p className={styles.description}>Choose a mode, then pick a course if relevant.</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* Mode radio group */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Mode</legend>
          <div className={styles.radioGroup}>
            {PICKER_MODES.map((mode) => (
              <label key={mode} className={styles.radioLabel}>
                <input
                  type="radio"
                  name="mode"
                  value={mode}
                  checked={modeId === mode}
                  onChange={() => setModeId(mode)}
                  className={styles.radioInput}
                />
                <span className={styles.radioText}>{mode}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Course dropdown — shown when mode accepts a course */}
        {showCourse && (
          <div className={styles.field}>
            <label htmlFor="new-tab-course" className={styles.label}>
              Course (optional)
            </label>
            <select
              id="new-tab-course"
              className={styles.select}
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              disabled={coursesLoading || submitting}
            >
              <option value="">— none —</option>
              {courses.map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {submitError && (
          <p className={styles.error} role="alert">
            {submitError}
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button type="submit" className={styles.openBtn} disabled={submitting}>
            {submitting ? "Opening…" : "Open"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
