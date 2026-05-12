import type { JSX } from "react";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useLock } from "../hooks/use-lock.js";
import styles from "./mode-append-editor.module.css";
import { LoadingState } from "./loading-state.js";
import { PromptPreviewPane } from "./prompt-preview-pane.js";

const STUDENT_MODES = [
  "teach",
  "quiz",
  "homework",
  "exam",
  "configure",
  "bootstrap",
  "study-skills",
] as const;

/**
 * Per-mode append editor — Configure → Prompt tab section.
 *
 * Lets the user add text to the end of a specific mode's system prompt, injected
 * at the `user-append` position (after the framework content, before the postamble).
 *
 * Mode selector drives both the textarea content (loaded on mode change) and the
 * live preview pane. When the user has unsaved edits and switches modes, they are
 * asked to confirm the discard via window.confirm.
 *
 * Lock semantics: textarea is read-only and save button hidden when the
 * configurator is locked — matches the existing prompt-tab lock behavior.
 */
export function ModeAppendEditor(): JSX.Element {
  const client = usePraxisClient();
  const { isSet, isUnlocked, loading: lockLoading } = useLock();

  const [selectedMode, setSelectedMode] = useState<string>("teach");
  const [stored, setStored] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const isLocked = isSet && !isUnlocked;
  const dirty = draft.trim() !== stored.trim();

  // Load stored append for the current mode.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const text = (await client.author.getModeAppend(selectedMode)) ?? "";
        if (!cancelled) {
          setStored(text);
          setDraft(text);
          setSavedAt(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, selectedMode]);

  const handleModeChange = (newMode: string) => {
    if (newMode === selectedMode) return;

    if (dirty) {
      const discard = window.confirm(
        "You have unsaved changes. Discard and switch mode?",
      );
      if (!discard) return;
    }

    setSelectedMode(newMode);
  };

  const save = async () => {
    if (!dirty || saving || isLocked) return;
    setSaving(true);
    setError(null);
    try {
      const value = draft.trim() === "" ? null : draft;
      await client.author.setModeAppend({ modeId: selectedMode, text: value });
      const trimmed = draft.trim();
      setStored(trimmed === "" ? "" : draft);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || lockLoading) {
    return <LoadingState />;
  }

  return (
    <div className={styles.editor}>
      <div className={styles.modeRow}>
        <label htmlFor="mode-append-mode-select" className={styles.fieldLabel}>
          mode
        </label>
        <select
          id="mode-append-mode-select"
          className={styles.modeSelect}
          value={selectedMode}
          onChange={(e) => handleModeChange(e.target.value)}
          aria-label="Select mode to edit"
        >
          {STUDENT_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {isLocked && (
        <p className={styles.lockHint} role="note">
          🔒 Unlock the configurator to edit mode appends.
        </p>
      )}

      <div className={styles.editorGrid}>
        <div className={styles.editorPane}>
          <label htmlFor="mode-append-textarea" className={styles.fieldLabel}>
            append text for {selectedMode}
          </label>
          <textarea
            id="mode-append-textarea"
            className={styles.textarea}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSavedAt(null);
            }}
            rows={10}
            maxLength={20_000}
            placeholder={`Add instructions specific to ${selectedMode} mode…`}
            disabled={saving || isLocked}
            readOnly={isLocked}
            aria-label={`Append text for ${selectedMode} mode`}
          />
          {!isLocked && (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={() => void save()}
                disabled={!dirty || saving}
              >
                {saving ? "saving…" : "save"}
              </button>
              {savedAt !== null && !dirty && (
                <span className={styles.savedHint}>saved · {savedAt.toLocaleTimeString()}</span>
              )}
              {error !== null && (
                <span className={styles.errorMsg} role="alert">
                  {error}
                </span>
              )}
            </div>
          )}
        </div>

        <PromptPreviewPane
          modeId={selectedMode}
          draftAppend={draft}
        />
      </div>
    </div>
  );
}
