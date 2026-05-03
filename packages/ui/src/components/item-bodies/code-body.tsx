import type { CodeItem } from "@praxis/core/types";
import cardStyles from "../assignment-item-card.module.css";

export interface CodeBodyProps {
  item: CodeItem;
  response: string;
  work?: string;
  onChange: (response: string) => void;
  onWorkChange?: (work: string) => void;
  disabled?: boolean;
}

export function CodeBody({
  item,
  response,
  work,
  onChange,
  onWorkChange,
  disabled = false,
}: CodeBodyProps) {
  const hasWorkRubric = item.workRubric !== undefined;

  if (hasWorkRubric) {
    // Code with workRubric: one textarea — the code IS the work AND the answer
    return (
      <div className={cardStyles.workSection}>
        <label htmlFor={`code-work-${item.id}`} className={cardStyles.workLabel}>
          your code (earns partial credit for approach):
        </label>
        <textarea
          id={`code-work-${item.id}`}
          className={cardStyles.codeInput}
          value={work ?? ""}
          onChange={(e) => {
            onWorkChange?.(e.target.value);
            onChange(e.target.value);
          }}
          disabled={disabled}
          rows={10}
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <textarea
      className={cardStyles.codeInput}
      value={response}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={10}
      spellCheck={false}
      aria-label="code answer"
    />
  );
}
