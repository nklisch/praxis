import type { QuickCheckAnswer, StructuredQuestionItem } from "@praxis/core/types";
import { type JSX, useState } from "react";
import styles from "./structured-question-card.module.css";

export interface StructuredQuestionCardProps {
  callId: string;
  item: StructuredQuestionItem;
  onResolve: (callId: string, answer: QuickCheckAnswer) => Promise<void>;
}

/**
 * Inline chat-thread card for a structured question posed by the tutor model
 * via the `ask_student_question` tool. Renders one fieldset per question with
 * a header chip, prompt text, and a list of option buttons.
 *
 * Single-select questions require exactly one selection before Submit enables.
 * Multi-select questions allow zero or more selections (no Submit gating).
 *
 * After submit, all controls are disabled and the button text changes to
 * "Submitted". Calls `onResolve` with a `structured-question` answer.
 */
export function StructuredQuestionCard({
  callId,
  item,
  onResolve,
}: StructuredQuestionCardProps): JSX.Element {
  const [selections, setSelections] = useState<Array<Set<number>>>(() =>
    item.questions.map(() => new Set<number>()),
  );
  const [submitted, setSubmitted] = useState(false);

  const toggle = (qIdx: number, optIdx: number): void => {
    if (submitted) return;
    setSelections((prev) => {
      const next = prev.map((s, i) => (i === qIdx ? new Set(s) : s));
      const set = next[qIdx]!;
      const multi = item.questions[qIdx]!.multiSelect;
      if (multi) {
        if (set.has(optIdx)) set.delete(optIdx);
        else set.add(optIdx);
      } else {
        set.clear();
        set.add(optIdx);
      }
      return next;
    });
  };

  const submit = async (): Promise<void> => {
    if (submitted) return;
    setSubmitted(true);
    const answers = selections.map((set, qIdx) => ({
      questionIndex: qIdx,
      selectedIndices: [...set].sort((a, b) => a - b),
    }));
    await onResolve(callId, { kind: "structured-question", answers });
  };

  // Submit is only gated on single-select questions: each must have exactly one
  // selection. Multi-select questions allow zero selections — no gating.
  const canSubmit = item.questions.every((q, i) => q.multiSelect || selections[i]!.size === 1);

  return (
    <section className={styles.card}>
      <div className={styles.tag}>
        <span className={styles.tagOrnament}>⌖</span>
        <span>tutor asked</span>
      </div>
      {item.questions.map((q, qIdx) => (
        <fieldset
          // biome-ignore lint/suspicious/noArrayIndexKey: questions are positional, no stable id
          key={qIdx}
          className={styles.question}
          disabled={submitted}
        >
          <legend className={styles.headerChip}>{q.header}</legend>
          <p className={styles.prompt}>{q.prompt}</p>
          <ul className={styles.options}>
            {q.options.map((opt, optIdx) => {
              const selected = selections[qIdx]!.has(optIdx);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: options are positional, no stable id
                <li key={optIdx}>
                  <button
                    type="button"
                    className={selected ? styles.optionSelected : styles.option}
                    onClick={() => toggle(qIdx, optIdx)}
                    aria-pressed={selected}
                  >
                    <span className={styles.optionLabel}>{opt.label}</span>
                    {opt.description !== undefined && (
                      <span className={styles.optionDesc}>{opt.description}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.submit}
          onClick={() => void submit()}
          disabled={!canSubmit || submitted}
        >
          {submitted ? "Submitted" : "Submit"}
        </button>
      </div>
    </section>
  );
}
