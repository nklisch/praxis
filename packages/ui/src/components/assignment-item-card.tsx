import type { AssignmentItem } from "@praxis/core/types";
import styles from "./assignment-item-card.module.css";

export interface AssignmentItemCardProps {
  item: AssignmentItem;
  index: number;
  /** Primary answer / response. */
  response: string;
  /** Shown work text — only relevant when item has workRubric. */
  work?: string;
  onResponseChange: (response: string) => void;
  /** Called when shown work changes — only invoked for items with workRubric. */
  onWorkChange?: (work: string) => void;
  disabled?: boolean;
}

/**
 * Per-item input card. Renders the appropriate input control per item kind.
 * Items with workRubric show a "Show your work" area above the primary input.
 *
 * Phase 8: code items with workRubric collapse to a single textarea (the
 * code IS the work; the rubric agent grades the code text directly).
 */
export function AssignmentItemCard({
  item,
  index,
  response,
  work,
  onResponseChange,
  onWorkChange,
  disabled = false,
}: AssignmentItemCardProps) {
  const hasWorkRubric = item.workRubric !== undefined;

  return (
    <div className={styles.itemCard}>
      <div className={styles.itemHeader}>
        <span className={styles.itemNumber}>Item {index + 1}</span>
        <span className={styles.itemKind}>{item.kind}</span>
        {hasWorkRubric && (
          <span className={styles.partialCreditBadge}>partial credit available</span>
        )}
      </div>

      <p className={styles.prompt}>{item.prompt}</p>

      {/* Work field — shown for math/code items with workRubric */}
      {hasWorkRubric && item.kind === "math" && (
        <div className={styles.workSection}>
          <label htmlFor={`work-${item.id}`} className={styles.workLabel}>
            Show your work (optional, earns partial credit):
          </label>
          <textarea
            id={`work-${item.id}`}
            className={styles.workInput}
            value={work ?? ""}
            onChange={(e) => onWorkChange?.(e.target.value)}
            disabled={disabled}
            rows={5}
          />
        </div>
      )}

      {/* Code item with workRubric: one textarea (code is the work AND answer) */}
      {hasWorkRubric && item.kind === "code" && (
        <div className={styles.workSection}>
          <label htmlFor={`code-work-${item.id}`} className={styles.workLabel}>
            Your code (earns partial credit for approach):
          </label>
          <textarea
            id={`code-work-${item.id}`}
            className={styles.codeInput}
            value={work ?? ""}
            onChange={(e) => {
              // For code+workRubric: the work IS the answer — sync both
              onWorkChange?.(e.target.value);
              onResponseChange(e.target.value);
            }}
            disabled={disabled}
            rows={10}
            spellCheck={false}
          />
        </div>
      )}

      {/* Primary input — per kind */}
      {item.kind === "multiple-choice" && item.options && (
        <ul className={styles.options}>
          {item.options.map((opt, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: options have no stable id
            <li key={i}>
              <label className={`${styles.optionLabel} ${disabled ? styles.disabled : ""}`}>
                <input
                  type="radio"
                  className={styles.optionInput}
                  name={`item-${item.id}`}
                  value={String(i)}
                  checked={response === String(i)}
                  onChange={() => onResponseChange(String(i))}
                  disabled={disabled}
                />
                {opt}
              </label>
            </li>
          ))}
        </ul>
      )}

      {item.kind === "short-answer" && (
        <input
          type="text"
          className={styles.textInput}
          value={response}
          onChange={(e) => onResponseChange(e.target.value)}
          disabled={disabled}
          placeholder="Type your answer…"
          aria-label={`Item ${index + 1} answer`}
        />
      )}

      {item.kind === "math" && (
        <div className={styles.mathAnswer}>
          {hasWorkRubric && (
            <label htmlFor={`math-answer-${item.id}`} className={styles.answerLabel}>
              Final answer:
            </label>
          )}
          <input
            id={hasWorkRubric ? `math-answer-${item.id}` : undefined}
            type="text"
            className={styles.mathInput}
            value={response}
            onChange={(e) => onResponseChange(e.target.value)}
            disabled={disabled}
            placeholder="Enter your answer (e.g., x = 3)"
            aria-label={`Item ${index + 1} answer`}
          />
        </div>
      )}

      {/* Code without workRubric: single textarea */}
      {item.kind === "code" && !hasWorkRubric && (
        <textarea
          className={styles.codeInput}
          value={response}
          onChange={(e) => onResponseChange(e.target.value)}
          disabled={disabled}
          rows={10}
          spellCheck={false}
          aria-label={`Item ${index + 1} code`}
        />
      )}
      {/* Code WITH workRubric: already handled above (work textarea doubles as answer) */}

      {item.kind === "free-response" && (
        <textarea
          className={styles.freeResponseInput}
          value={response}
          onChange={(e) => onResponseChange(e.target.value)}
          disabled={disabled}
          rows={5}
          placeholder="Write your response…"
          aria-label={`Item ${index + 1} response`}
        />
      )}
    </div>
  );
}
