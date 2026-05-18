import { listModes } from "@praxis/curriculum/modes";
import { type FormEvent, useEffect, useState } from "react";
import { PromptBlockStack } from "../../components/prompt-block-stack.js";
import { StyleSlider } from "../../components/style-slider.js";
import { usePraxisClient } from "../../context/client-context.js";
import { useDirtyState } from "../../hooks/use-dirty-state.js";
import { COPY } from "../../lib/copy.js";
import styles from "./prompt-tab.module.css";

// ---------------------------------------------------------------------------
// StyleSliderForm (extracted from old PromptTab — keeps behavior identical)
// ---------------------------------------------------------------------------

function StyleSliderForm() {
  const client = usePraxisClient();
  const { markDirty, markClean } = useDirtyState("configure.prompt");

  const [socratic, setSocratic] = useState(0);
  const [verbosity, setVerbosity] = useState(0);
  const [formality, setFormality] = useState(0);
  const [sliderSaving, setSliderSaving] = useState(false);
  const [sliderError, setSliderError] = useState<string | null>(null);
  const [sliderSaved, setSliderSaved] = useState(false);

  // Mirror slider dirtiness into the cross-tab tracker.
  const isSlidersDirty = socratic !== 0 || verbosity !== 0 || formality !== 0;
  useEffect(() => {
    if (isSlidersDirty) {
      markDirty();
    } else {
      markClean();
    }
  }, [isSlidersDirty, markDirty, markClean]);

  const handleSliderSave = async (e: FormEvent) => {
    e.preventDefault();
    setSliderSaving(true);
    setSliderError(null);
    setSliderSaved(false);
    try {
      await client.author.setStyleSliders({ socratic, verbosity, formality });
      setSliderSaved(true);
      markClean();
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
// PromptTab — v3 two-section surface
// ---------------------------------------------------------------------------

const ALL_MODES = listModes();
const DEFAULT_MODE_ID = "teach";

/**
 * Configure → Prompt tab (v3 layout).
 *
 * Two ordered sections:
 *   1. Teaching style — highest-frequency knob, lives at the top.
 *   2. Prompt blocks — unified block-list / composed-toggle surface
 *      that replaces the four parallel preview shapes from v2
 *      (global / append / composed / full-fragment).
 *
 * No RouteHeader: this is a tab panel inside <ConfigureRoute>.
 */
export function PromptTab() {
  const [modeId, setModeId] = useState<string>(ALL_MODES[0]?.id ?? DEFAULT_MODE_ID);

  return (
    <div className={styles.layout}>
      {/* ── 1. Teaching style ─────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{COPY.prompt.styleSectionTitle}</h2>
        <p className={styles.sectionDesc}>{COPY.prompt.styleSectionDesc}</p>
        <StyleSliderForm />
      </section>

      {/* ── 2. Prompt blocks (unified) ────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{COPY.prompt.blocksSectionTitle}</h2>
        <p className={styles.sectionDesc}>{COPY.prompt.blocksSectionDesc}</p>
        <PromptBlockStack modeId={modeId} onModeChange={setModeId} />
      </section>
    </div>
  );
}
