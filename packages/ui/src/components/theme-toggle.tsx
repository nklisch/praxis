import type { ThemePref } from "../hooks/use-theme.js";
import { useTheme } from "../hooks/use-theme.js";
import styles from "./theme-toggle.module.css";

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "auto", label: "auto" },
  { value: "light", label: "light" },
  { value: "dark", label: "dark" },
];

/**
 * 3-state segmented theme control (auto · light · dark).
 *
 * Renders in the app-shell running-head status strip.  Calls `useTheme`
 * internally; no props required — just mount it and it is self-contained.
 *
 * Styling matches option-3.html: mono kicker font, transparent background,
 * accent underline on the active button.
 */
export function ThemeToggle() {
  const { pref, setPref } = useTheme();

  return (
    <fieldset className={styles.toggle}>
      <legend className={styles.legend}>Theme</legend>
      {OPTIONS.map((opt, i) => (
        <span key={opt.value} style={{ display: "contents" }}>
          {i > 0 && (
            <span className={styles.sep} aria-hidden="true">
              ·
            </span>
          )}
          <button
            type="button"
            className={`${styles.btn}${pref === opt.value ? ` ${styles.btnActive}` : ""}`}
            aria-pressed={pref === opt.value}
            onClick={() => setPref(opt.value)}
          >
            {opt.label}
          </button>
        </span>
      ))}
    </fieldset>
  );
}
