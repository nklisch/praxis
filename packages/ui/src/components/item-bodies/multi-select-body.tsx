import type { MultiSelectItem } from "@praxis/core/types";
import styles from "./item-body-shared.module.css";

export interface MultiSelectBodyProps {
  item: MultiSelectItem;
  /** JSON-encoded array of selected indices, e.g. "[0,2]". "" for none selected. */
  response: string;
  onChange: (response: string) => void;
  disabled?: boolean;
  /** When set, reveals correct/incorrect feedback on each option. */
  feedback?: { correctIndices: number[] };
}

function parseSelected(response: string): number[] {
  if (!response || response === "") return [];
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) return parsed as number[];
  } catch {
    // malformed — ignore
  }
  return [];
}

export function MultiSelectBody({
  item,
  response,
  onChange,
  disabled = false,
  feedback,
}: MultiSelectBodyProps) {
  const selected = parseSelected(response);

  const toggle = (idx: number) => {
    const next = selected.includes(idx)
      ? selected.filter((i) => i !== idx)
      : [...selected, idx].sort((a, b) => a - b);
    onChange(JSON.stringify(next));
  };

  const correctSet = feedback ? new Set(feedback.correctIndices) : null;

  return (
    <ul className={styles.optionList}>
      {item.options.map((opt, i) => {
        const isSelected = selected.includes(i);
        const feedbackClass =
          correctSet !== null
            ? correctSet.has(i)
              ? styles.correct
              : isSelected
                ? styles.incorrect
                : ""
            : "";

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: options have no stable id
          <li key={i}>
            <label
              className={`${styles.optionLabel} ${disabled ? styles.disabled : ""} ${feedbackClass}`}
            >
              <input
                type="checkbox"
                className={styles.optionInput}
                value={String(i)}
                checked={isSelected}
                onChange={() => toggle(i)}
                disabled={disabled}
              />
              {opt}
              {correctSet?.has(i) && (
                <span className={styles.feedbackGlyph} aria-hidden="true">
                  ·
                </span>
              )}
              {correctSet !== null && isSelected && !correctSet.has(i) && (
                <span className={styles.feedbackGlyph} aria-hidden="true">
                  °
                </span>
              )}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
