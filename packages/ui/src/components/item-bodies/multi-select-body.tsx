import type { MultiSelectItem } from "@praxis/core/types";
import indicatorStyles from "./choice-indicator.module.css";
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
        const isCorrect = correctSet?.has(i) ?? false;
        const isIncorrect = correctSet !== null && isSelected && !correctSet.has(i);

        const indicatorClass = [
          indicatorStyles.choiceIndicator,
          indicatorStyles.choiceIndicatorCheck,
          isCorrect ? indicatorStyles.choiceIndicatorCorrect : undefined,
          isIncorrect ? indicatorStyles.choiceIndicatorIncorrect : undefined,
        ]
          .filter(Boolean)
          .join(" ");

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: options have no stable id
          <li key={i}>
            <label className={`${styles.optionLabel} ${disabled ? styles.disabled : ""}`}>
              <input
                type="checkbox"
                className={styles.optionInput}
                value={String(i)}
                checked={isSelected}
                onChange={() => toggle(i)}
                disabled={disabled}
              />
              <span
                className={indicatorClass}
                data-selected={isSelected ? "true" : undefined}
                aria-hidden="true"
              />
              {opt}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
