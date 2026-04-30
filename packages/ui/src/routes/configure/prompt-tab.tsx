import { type FormEvent, useState } from "react";
import { PromptFragmentEditor } from "../../components/prompt-fragment-editor.js";
import { StyleSlider } from "../../components/style-slider.js";
import { usePraxisClient } from "../../context/client-context.js";
import styles from "./prompt-tab.module.css";

/**
 * Prompt tab — two sections:
 *  1. Style sliders: Socratic/Lecture, Terse/Verbose, Formal/Casual → setStyleSliders
 *  2. Fragment editor: per-mode fragment override textarea
 */
export function PromptTab() {
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
    <div className={styles.layout}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Teaching Style</h2>
        <p className={styles.sectionDesc}>
          Adjust how the tutor communicates. Changes apply globally across sessions.
        </p>

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
            {sliderSaving ? "Saving…" : "Save style"}
          </button>
        </form>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Prompt Fragment Overrides</h2>
        <p className={styles.sectionDesc}>
          Override individual prompt fragments for specific modes. The agent uses these instead of
          the built-in defaults.
        </p>

        <PromptFragmentEditor />
      </section>
    </div>
  );
}
