import styles from "./style-slider.module.css";

export interface StyleSliderProps {
  label: string;
  lowLabel: string;
  highLabel: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * A single style slider — numeric range input from -1 to 1.
 * Shows low/high pole labels on either side.
 */
export function StyleSlider({
  label,
  lowLabel,
  highLabel,
  value,
  onChange,
  disabled = false,
}: StyleSliderProps) {
  return (
    <div className={styles.sliderGroup}>
      <span className={styles.sliderLabel}>{label}</span>
      <div className={styles.sliderRow}>
        <span className={styles.poleLabel}>{lowLabel}</span>
        <input
          type="range"
          className={styles.slider}
          min={-1}
          max={1}
          step={0.1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          aria-label={label}
        />
        <span className={styles.poleLabel}>{highLabel}</span>
      </div>
      <span className={styles.value}>{value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)}</span>
    </div>
  );
}
