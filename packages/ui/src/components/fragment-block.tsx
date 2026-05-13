import type { PromptFragment } from "@praxis/core/types";
import type { JSX } from "react";
import { useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useLock } from "../hooks/use-lock.js";
import { COPY } from "../lib/copy.js";
import styles from "./fragment-block.module.css";

export interface FragmentBlockProps {
  modeId: string;
  /** The fragment definition — includes `customizable` flag and default `template`. */
  fragment: PromptFragment;
  /** Current stored override, or null when no override exists. */
  override: string | null;
  /** Called after a successful save or clear so the parent refreshes the override list. */
  onOverrideChange: () => void;
}

/**
 * Renders a single prompt fragment as a block in the Configure → Prompt surface.
 *
 * Three display modes:
 * - Customizable + lock off: editable textarea, Save/Cancel, Return-to-default,
 *   per-block Diff toggle, Edited badge when an override is stored.
 * - Customizable + lock on: read-only `<pre>`, lock hint below, no edit affordances.
 * - Non-customizable: read-only `<pre>` with a Locked badge, no Diff button.
 *
 * Fixes the "lock-button does nothing on fragment editor" bug by mirroring
 * `useLock()` from GlobalPromptEditor and ModeAppendEditor.
 */
export function FragmentBlock({
  modeId,
  fragment,
  override,
  onOverrideChange,
}: FragmentBlockProps): JSX.Element {
  const client = usePraxisClient();
  const { isSet, isUnlocked } = useLock();
  const isLocked = isSet && !isUnlocked;

  // editable: only when the fragment is customizable AND the configurator lock is off.
  const editable = fragment.customizable && !isLocked;

  const [draft, setDraft] = useState<string>(override ?? fragment.template);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const hasOverride = override !== null;

  const save = async () => {
    if (!editable || !dirty || saving) return;
    setSaving(true);
    try {
      await client.author.customizePrompt(modeId, fragment.id, draft);
      setDirty(false);
      onOverrideChange();
    } finally {
      setSaving(false);
    }
  };

  const returnToDefault = async () => {
    if (!editable) return;
    setSaving(true);
    try {
      await client.author.clearFragmentOverride({ modeId, fragmentId: fragment.id });
      setDraft(fragment.template);
      setDirty(false);
      onOverrideChange();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className={styles.block}
      data-locked={isLocked || !fragment.customizable}
      data-customizable={fragment.customizable}
    >
      <header className={styles.header}>
        <h3 className={styles.title}>{fragment.id}</h3>
        <div className={styles.badges}>
          {!fragment.customizable && (
            <span className={styles.lockedBadge}>{COPY.prompt.fragmentBlockLockedBadge}</span>
          )}
          {hasOverride && (
            <span className={styles.editedBadge}>{COPY.prompt.fragmentBlockEditedBadge}</span>
          )}
        </div>
        <div className={styles.headerActions}>
          {fragment.customizable && (
            <button type="button" className={styles.diffBtn} onClick={() => setShowDiff((v) => !v)}>
              {showDiff ? COPY.prompt.fragmentBlockDiffHide : COPY.prompt.fragmentBlockDiffShow}
            </button>
          )}
          {editable && hasOverride && (
            <button
              type="button"
              className={styles.returnBtn}
              onClick={() => void returnToDefault()}
              disabled={saving}
            >
              {COPY.prompt.fragmentBlockReturnToDefault}
            </button>
          )}
        </div>
      </header>

      {editable ? (
        <>
          <textarea
            className={styles.editor}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            disabled={saving}
          />
          <div className={styles.editorActions}>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={() => void save()}
              disabled={!dirty || saving}
            >
              {saving ? COPY.loading.saving : "Save"}
            </button>
            {dirty && (
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => {
                  setDraft(override ?? fragment.template);
                  setDirty(false);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <pre className={styles.readonly}>{override ?? fragment.template}</pre>
      )}

      {showDiff && fragment.customizable && (
        <div className={styles.diff}>
          <div className={styles.diffCol}>
            <div className={styles.diffHeader}>Default</div>
            <pre className={styles.diffPre}>{fragment.template}</pre>
          </div>
          <div className={styles.diffCol}>
            <div className={styles.diffHeader}>Current</div>
            <pre className={styles.diffPre}>{override ?? fragment.template}</pre>
          </div>
        </div>
      )}

      {isLocked && fragment.customizable && (
        <p className={styles.lockHint}>{COPY.prompt.fragmentBlockLockHint}</p>
      )}
    </section>
  );
}
