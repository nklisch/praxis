import type { JSX } from "react";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useLock } from "../hooks/use-lock.js";
import styles from "./global-prompt-editor.module.css";
import { LoadingState } from "./loading-state.js";
import { PromptPreviewPane } from "./prompt-preview-pane.js";

/**
 * Global prompt editor — Settings section.
 *
 * Lets the user set a cross-mode prompt fragment that injects into every
 * mode's system prompt at the `user-global` position. Side-by-side layout:
 * textarea on the left, live preview pane on the right. On narrow viewports
 * the two panes stack vertically (CSS media query).
 *
 * Lock semantics: when the configurator is locked (isSet && !isUnlocked),
 * the textarea is read-only and the save button is hidden, with an
 * "unlock to edit" hint — matches the existing prompt-tab lock behavior.
 */
export function GlobalPromptEditor(): JSX.Element {
  const client = usePraxisClient();
  const { isSet, isUnlocked, loading: lockLoading } = useLock();

  const [stored, setStored] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [previewMode, setPreviewMode] = useState<string>("teach");

  const isLocked = isSet && !isUnlocked;
  const dirty = draft.trim() !== stored.trim();

  // Load stored global prompt on mount.
  useEffect(() => {
    void (async () => {
      try {
        const text = (await client.author.getGlobalPrompt()) ?? "";
        setStored(text);
        setDraft(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [client]);

  const save = async () => {
    if (!dirty || saving || isLocked) return;
    setSaving(true);
    setError(null);
    try {
      const value = draft.trim() === "" ? null : draft;
      await client.author.setGlobalPrompt(value);
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
    <section className={styles.section}>
      <h2 className={styles.heading}>Global prompt</h2>
      <p className={styles.lede}>
        Text injected into every mode's system prompt. Use it for cross-cutting teaching style or
        persona guidance that should apply universally.
      </p>

      {isLocked && (
        <p className={styles.lockHint} role="note">
          🔒 Unlock the configurator to edit the global prompt.
        </p>
      )}

      <div className={styles.editorGrid}>
        <div className={styles.editorPane}>
          <label htmlFor="global-prompt-textarea" className={styles.fieldLabel}>
            Your text
          </label>
          <textarea
            id="global-prompt-textarea"
            className={styles.textarea}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSavedAt(null);
            }}
            rows={12}
            maxLength={20_000}
            placeholder="Add cross-mode guidance for your tutor…"
            disabled={saving || isLocked}
            readOnly={isLocked}
            aria-label="Global prompt text"
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
          modeId={previewMode}
          draftGlobal={draft}
          showModeSelector
          onModeChange={setPreviewMode}
        />
      </div>
    </section>
  );
}
