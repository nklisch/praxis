import type { SingleChoiceItem } from "@praxis/core/types";
import indicatorStyles from "./choice-indicator.module.css";
import styles from "./item-body-shared.module.css";

export interface SingleChoiceBodyProps {
  item: SingleChoiceItem;
  /** Selected option index as string (e.g. "0", "1") or "" for unselected. */
  response: string;
  onChange: (response: string) => void;
  disabled?: boolean;
  /** When set, reveals correct/incorrect feedback on each option. */
  feedback?: { correctIndex: number } | undefined;
}

export function SingleChoiceBody({
  item,
  response,
  onChange,
  disabled = false,
  feedback,
}: SingleChoiceBodyProps) {
  return (
    <ul className={styles.optionList}>
      {item.options.map((opt, i) => {
        const isSelected = response === String(i);
        const isCorrect = feedback !== undefined && i === feedback.correctIndex;
        const isIncorrect = feedback !== undefined && isSelected && i !== feedback.correctIndex;

        const indicatorClass = [
          indicatorStyles.choiceIndicator,
          indicatorStyles.choiceIndicatorRadio,
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
                type="radio"
                className={styles.optionInput}
                name={`item-${item.id}`}
                value={String(i)}
                checked={isSelected}
                onChange={() => onChange(String(i))}
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
