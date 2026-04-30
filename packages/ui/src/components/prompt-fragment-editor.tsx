import { type FormEvent, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./prompt-fragment-editor.module.css";

/**
 * Hard-coded list of customizable fragments per design spec.
 * Phase 14+ may derive this dynamically from the mode registry.
 */
export const CUSTOMIZABLE_FRAGMENTS: Array<{
  modeId: string;
  modeName: string;
  fragmentId: string;
  fragmentName: string;
}> = [
  { modeId: "teach", modeName: "Teach", fragmentId: "role.tutor", fragmentName: "Tutor role" },
  {
    modeId: "teach",
    modeName: "Teach",
    fragmentId: "constraints.productive-struggle",
    fragmentName: "Productive struggle",
  },
  {
    modeId: "teach",
    modeName: "Teach",
    fragmentId: "preamble.default",
    fragmentName: "Preamble",
  },
  { modeId: "quiz", modeName: "Quiz", fragmentId: "role.quiz", fragmentName: "Quiz role" },
  {
    modeId: "homework",
    modeName: "Homework",
    fragmentId: "role.homework",
    fragmentName: "Homework role",
  },
  {
    modeId: "configure",
    modeName: "Configure",
    fragmentId: "role.configure",
    fragmentName: "Configure role",
  },
];

export interface PromptFragmentEditorProps {
  initialModeId?: string;
  initialFragmentId?: string;
}

/**
 * Fragment selector + override textarea + Save/Clear buttons.
 *
 * Writes via client.author.customizePrompt (set override) or
 * client.author.clearFragmentOverride (clear back to default).
 */
export function PromptFragmentEditor({
  initialModeId,
  initialFragmentId,
}: PromptFragmentEditorProps) {
  const client = usePraxisClient();

  const [selectedKey, setSelectedKey] = useState<string>(() => {
    if (initialModeId && initialFragmentId) return `${initialModeId}::${initialFragmentId}`;
    return CUSTOMIZABLE_FRAGMENTS[0]
      ? `${CUSTOMIZABLE_FRAGMENTS[0].modeId}::${CUSTOMIZABLE_FRAGMENTS[0].fragmentId}`
      : "";
  });

  const [override, setOverride] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const selected = CUSTOMIZABLE_FRAGMENTS.find(
    (f) => `${f.modeId}::${f.fragmentId}` === selectedKey,
  );

  const showSuccess = (msg: string) => {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(null), 3000);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !override.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await client.author.customizePrompt(selected.modeId, selected.fragmentId, override.trim());
      showSuccess("Override saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!selected) return;
    setClearing(true);
    setError(null);
    try {
      await client.author.clearFragmentOverride({
        modeId: selected.modeId,
        fragmentId: selected.fragmentId,
      });
      setOverride("");
      showSuccess("Override cleared — using default fragment.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className={styles.editor}>
      <div className={styles.selectorRow}>
        <label className={styles.label}>
          Mode / Fragment
          <select
            className={styles.select}
            value={selectedKey}
            onChange={(e) => {
              setSelectedKey(e.target.value);
              setOverride("");
              setError(null);
              setSavedMsg(null);
            }}
          >
            {CUSTOMIZABLE_FRAGMENTS.map((f) => (
              <option key={`${f.modeId}::${f.fragmentId}`} value={`${f.modeId}::${f.fragmentId}`}>
                {f.modeName} — {f.fragmentName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selected && (
        <form onSubmit={handleSave} className={styles.form}>
          <label className={styles.label}>
            Override text
            <textarea
              className={styles.textarea}
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              rows={8}
              disabled={saving || clearing}
              placeholder={`Override the "${selected.fragmentName}" fragment for ${selected.modeName} mode. Leave blank to use the default.`}
            />
          </label>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {savedMsg && (
            <p className={styles.success} role="status">
              {savedMsg}
            </p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.clearBtn}
              onClick={handleClear}
              disabled={saving || clearing}
            >
              {clearing ? "Clearing…" : "Clear override"}
            </button>
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={saving || clearing || !override.trim()}
            >
              {saving ? "Saving…" : "Save override"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
