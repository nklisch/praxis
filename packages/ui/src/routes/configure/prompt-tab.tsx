import type { PromptFragment } from "@praxis/core/types";
import { listModes, requireMode } from "@praxis/curriculum/modes";
import { type FormEvent, useState } from "react";
import { GlobalPromptEditor } from "../../components/global-prompt-editor.js";
import { ModeAppendEditor } from "../../components/mode-append-editor.js";
import { PromptFragmentEditor } from "../../components/prompt-fragment-editor.js";
import { PromptPreviewPane } from "../../components/prompt-preview-pane.js";
import { StyleSlider } from "../../components/style-slider.js";
import { usePraxisClient } from "../../context/client-context.js";
import { COPY } from "../../lib/copy.js";
import styles from "./prompt-tab.module.css";

// ---------------------------------------------------------------------------
// FragmentStack
// ---------------------------------------------------------------------------

interface FragmentBlockProps {
  modeId: string;
  fragment: PromptFragment;
}

function FragmentBlock({ modeId, fragment }: FragmentBlockProps) {
  if (fragment.customizable) {
    return (
      <div className={styles.fragmentBlock}>
        <div className={styles.fragmentBlockHeader}>
          <span className={styles.fragmentId}>{fragment.id}</span>
          <span className={styles.fragmentPosition}>{fragment.position}</span>
        </div>
        <PromptFragmentEditor initialModeId={modeId} initialFragmentId={fragment.id} />
      </div>
    );
  }

  // Locked (non-customizable) — render read-only with the default template.
  return (
    <div className={`${styles.fragmentBlock} ${styles.fragmentBlockLocked}`}>
      <div className={styles.fragmentBlockHeader}>
        <span className={styles.fragmentId}>{fragment.id}</span>
        <span className={styles.fragmentPosition}>{fragment.position}</span>
        <span className={styles.lockedBadge}>{COPY.prompt.lockedFragmentLabel}</span>
      </div>
      <pre className={styles.fragmentTemplate}>{fragment.template}</pre>
    </div>
  );
}

interface FragmentStackProps {
  modeId: string;
}

function FragmentStack({ modeId }: FragmentStackProps) {
  const mode = requireMode(modeId);

  // Filter out user-authored positions — user-global is handled by GlobalPromptEditor above
  // the stack. user-append is always rendered as a dedicated block at the bottom of the stack,
  // even if it isn't listed in the mode's static promptFragments (it's injected dynamically).
  const staticFragments = mode.promptFragments.filter(
    (f) => f.position !== "user-global" && f.position !== "user-append",
  );

  return (
    <div className={styles.fragmentStack}>
      {staticFragments.map((fragment) => (
        <FragmentBlock key={fragment.id} modeId={modeId} fragment={fragment} />
      ))}

      {/* user-append: per-mode append, always present as the final slot */}
      <div className={styles.fragmentBlock}>
        <div className={styles.fragmentBlockHeader}>
          <span className={styles.fragmentId}>user-append</span>
          <span className={styles.fragmentPosition}>user-append</span>
        </div>
        <ModeAppendEditor />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromptPreviewWithToggle
// ---------------------------------------------------------------------------

type PreviewTab = "composed" | "diff";

interface PromptPreviewWithToggleProps {
  modeId: string;
}

function PromptPreviewWithToggle({ modeId }: PromptPreviewWithToggleProps) {
  const [activeTab, setActiveTab] = useState<PreviewTab>("composed");

  return (
    <div className={styles.previewContainer}>
      <div className={styles.previewToggleRow} role="tablist" aria-label="Preview mode">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "composed"}
          className={`${styles.toggleBtn} ${activeTab === "composed" ? styles.toggleBtnActive : ""}`}
          onClick={() => setActiveTab("composed")}
        >
          {COPY.prompt.previewToggleComposed}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "diff"}
          aria-disabled="true"
          disabled
          className={styles.toggleBtn}
          title={COPY.prompt.diffToggleDisabledTooltip}
        >
          {COPY.prompt.previewToggleDiff}
        </button>
      </div>

      {activeTab === "composed" && <PromptPreviewPane modeId={modeId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StyleSliderForm (extracted from old PromptTab — keeps behavior identical)
// ---------------------------------------------------------------------------

function StyleSliderForm() {
  const client = usePraxisClient();

  const [socratic, setSocratic] = useState(0);
  const [verbosity, setVerbosity] = useState(0);
  const [formality, setFormality] = useState(0);
  const [sliderSaving, setSliderSaving] = useState(false);
  const [sliderError, setSliderError] = useState<string | null>(null);
  const [sliderSaved, setSliderSaved] = useState(false);

  const handleSliderSave = async (e: FormEvent) => {
    e.preventDefault();
    setSliderSaving(true);
    setSliderError(null);
    setSliderSaved(false);
    try {
      await client.author.setStyleSliders({ socratic, verbosity, formality });
      setSliderSaved(true);
      setTimeout(() => setSliderSaved(false), 3000);
    } catch (err) {
      setSliderError(err instanceof Error ? err.message : String(err));
    } finally {
      setSliderSaving(false);
    }
  };

  return (
    <form onSubmit={handleSliderSave} className={styles.sliderForm}>
      <StyleSlider
        label="Guidance style"
        lowLabel="Lecture"
        highLabel="Socratic"
        value={socratic}
        onChange={setSocratic}
        disabled={sliderSaving}
      />
      <StyleSlider
        label="Verbosity"
        lowLabel="Terse"
        highLabel="Verbose"
        value={verbosity}
        onChange={setVerbosity}
        disabled={sliderSaving}
      />
      <StyleSlider
        label="Tone"
        lowLabel="Casual"
        highLabel="Formal"
        value={formality}
        onChange={setFormality}
        disabled={sliderSaving}
      />

      {sliderError && (
        <p className={styles.error} role="alert">
          {sliderError}
        </p>
      )}
      {sliderSaved && (
        <p className={styles.success} role="status">
          Style saved.
        </p>
      )}

      <button type="submit" className={styles.saveBtn} disabled={sliderSaving}>
        {sliderSaving ? COPY.loading.saving : "Save style"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// PromptTab — the unified surface
// ---------------------------------------------------------------------------

const ALL_MODES = listModes();
const DEFAULT_MODE_ID = "teach";

/**
 * Unified prompt-customization surface in Configure.
 *
 * Hosts all three customization layers in one coherent screen:
 *   1. Global Fragment — cross-mode, injected at `user-global` position
 *   2. Mode picker → Fragment Stack — per-mode fragments in FRAGMENT_ORDER,
 *      with customizable slots hosting PromptFragmentEditor and the
 *      user-append slot hosting ModeAppendEditor
 *   3. Composed Preview — live preview of the selected mode's system prompt,
 *      with a [Composed | Diff] toggle (Diff disabled until diff-aware-preview
 *      lands)
 *   4. Teaching Style sliders — separate concern, kept as its own section
 *
 * No RouteHeader: this is a tab panel inside <ConfigureRoute>.
 */
export function PromptTab() {
  const [modeId, setModeId] = useState<string>(DEFAULT_MODE_ID);

  return (
    <div className={styles.layout}>
      {/* ── 1. Global fragment ─────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{COPY.prompt.globalSectionTitle}</h2>
        <p className={styles.sectionDesc}>{COPY.prompt.globalSectionDesc}</p>
        <GlobalPromptEditor />
      </section>

      {/* ── 2. Mode picker ─────────────────────────────────────────── */}
      <section className={styles.modePicker}>
        <label htmlFor="prompt-mode-picker" className={styles.modePickerLabel}>
          {COPY.prompt.modePickerLabel}
        </label>
        <select
          id="prompt-mode-picker"
          className={styles.modeSelect}
          value={modeId}
          onChange={(e) => setModeId(e.target.value)}
        >
          {ALL_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </section>

      {/* ── 3. Fragment stack ──────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{COPY.prompt.fragmentSectionTitle}</h2>
        <p className={styles.sectionDesc}>{COPY.prompt.fragmentSectionDesc}</p>
        <FragmentStack modeId={modeId} />
      </section>

      {/* ── 4. Composed preview with Diff toggle ──────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{COPY.prompt.previewSectionTitle}</h2>
        <p className={styles.sectionDesc}>{COPY.prompt.previewSectionDesc}</p>
        <PromptPreviewWithToggle modeId={modeId} />
      </section>

      {/* ── 5. Teaching style sliders ─────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{COPY.prompt.styleSectionTitle}</h2>
        <p className={styles.sectionDesc}>{COPY.prompt.styleSectionDesc}</p>
        <StyleSliderForm />
      </section>
    </div>
  );
}
