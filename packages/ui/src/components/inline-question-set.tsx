/**
 * InlineQuestionSet — paged chassis for N in-flight structured questions.
 *
 * When a tutor turn produces more than one `ask_student_question` call, this
 * component renders them as a single card with a tab strip head and one visible
 * question body at a time, keeping the vertical footprint small so the chat
 * thread above remains visible.
 *
 * Tab states:
 *   --done       question has a recorded answer
 *   --active     currently visible question
 *   --unanswered question not yet answered
 *
 * Visual spec: .mockups/screens/feature-question-panel-rework/state-paged.html
 *              .mockups/design-system/components.css § .inline-question-set
 */
import type { StructuredQuestionItem } from "@praxis/core/types";
import { type JSX, useState } from "react";
import styles from "./inline-question-set.module.css";

/** A per-question answer in the set. */
export interface QuestionSetAnswer {
  /** Indices selected in the choices list (empty = no structured selection). */
  selectedIndices: number[];
  /** Free-form text entered by the student (empty string = not provided). */
  freeForm: string;
}

export interface InlineQuestionSetProps {
  questions: StructuredQuestionItem["questions"];
  /** Answers recorded so far, keyed by question index. */
  answers: Map<number, QuestionSetAnswer>;
  /** Which question is currently visible (0-based). */
  currentIndex: number;
  onTabClick: (index: number) => void;
  onAnswer: (questionIndex: number, answer: QuestionSetAnswer) => void;
  /** Called when the user submits the current question's answer. */
  onSubmit: (questionIndex: number, answer: QuestionSetAnswer) => void;
  /** Called when the user clicks "clarify in chat" for the current question. */
  onClarifyInChat: (questionIndex: number) => void;
  disabled?: boolean;
}

export function InlineQuestionSet({
  questions,
  answers,
  currentIndex,
  onTabClick,
  onAnswer,
  onSubmit,
  onClarifyInChat,
  disabled = false,
}: InlineQuestionSetProps): JSX.Element {
  const [freeFormValues, setFreeFormValues] = useState<Map<number, string>>(new Map());

  const totalAnswered = answers.size;
  const q = questions[currentIndex];

  const currentAnswer = answers.get(currentIndex);
  const currentSelections = currentAnswer?.selectedIndices ?? [];
  const currentFreeForm = freeFormValues.get(currentIndex) ?? "";

  const setFreeForm = (idx: number, value: string) => {
    setFreeFormValues((prev) => {
      const next = new Map(prev);
      next.set(idx, value);
      return next;
    });
    // Propagate partial answer update
    onAnswer(idx, {
      selectedIndices: answers.get(idx)?.selectedIndices ?? [],
      freeForm: value,
    });
  };

  const toggleChoice = (optIdx: number) => {
    if (disabled) return;
    const existing = answers.get(currentIndex)?.selectedIndices ?? [];
    const multi = q?.multiSelect ?? false;
    let next: number[];
    if (multi) {
      next = existing.includes(optIdx)
        ? existing.filter((i) => i !== optIdx)
        : [...existing, optIdx];
    } else {
      next = existing.includes(optIdx) && existing.length === 1 ? [] : [optIdx];
    }
    onAnswer(currentIndex, {
      selectedIndices: next,
      freeForm: freeFormValues.get(currentIndex) ?? "",
    });
  };

  const handleSubmit = () => {
    if (disabled) return;
    onSubmit(currentIndex, {
      selectedIndices: currentSelections,
      freeForm: currentFreeForm,
    });
  };

  const handleClarify = () => {
    if (disabled) return;
    onClarifyInChat(currentIndex);
  };

  // Submit is enabled when free-form is populated OR (for single-select) one choice is selected.
  // Multi-select: always submittable (zero selections OK). Single-select: require 1 selection OR free-form.
  const canSubmit =
    currentFreeForm.trim().length > 0 ||
    (q?.multiSelect === true ? true : currentSelections.length === 1);

  const prevIndex = currentIndex > 0 ? currentIndex - 1 : null;
  const nextIndex = currentIndex < questions.length - 1 ? currentIndex + 1 : null;

  // biome-ignore lint/complexity/noUselessFragments: empty fragment is the correct null-safe return for JSX.Element
  if (q === undefined) return <></>;

  return (
    <div className={styles.set}>
      {/* ── Tab strip head ─────────────────────────────────────────────────── */}
      <div className={styles.head}>
        <span className={styles.headLabel} aria-hidden="true">
          Questions
        </span>
        <div className={styles.tabs} role="tablist" aria-label="Questions">
          {questions.map((_, idx) => {
            const isDone = answers.has(idx);
            const isActive = idx === currentIndex;
            const tabClass = `${styles.tab} ${isActive ? styles.tabActive : isDone ? styles.tabDone : styles.tabUnanswered}`;
            const statusSymbol = isDone ? "✓" : isActive ? "●" : "○";
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: questions are positional
                key={idx}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={tabClass}
                onClick={() => onTabClick(idx)}
                disabled={disabled}
              >
                <span className={styles.tabStatus} aria-hidden="true">
                  {statusSymbol}
                </span>{" "}
                {idx + 1}
              </button>
            );
          })}
        </div>
        <span className={styles.headProgress}>
          {currentIndex + 1} of {questions.length}
          {totalAnswered > 0 ? ` · ${totalAnswered} answered` : ""}
        </span>
      </div>

      {/* ── Question body ───────────────────────────────────────────────────── */}
      <div className={styles.body}>
        {/* Kicker */}
        <div className={styles.kicker}>
          <span className={styles.kickerGlyph} aria-hidden="true">
            ?
          </span>
          <span>tutor asked · question {currentIndex + 1}</span>
          {q.multiSelect && <span className={styles.multiSelectBadge}>select all that apply</span>}
        </div>

        {/* Prompt */}
        <p className={styles.prompt}>{q.prompt}</p>

        {/* Choices */}
        <div className={styles.choices}>
          {q.options.map((opt, optIdx) => {
            const selected = currentSelections.includes(optIdx);
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: options are positional
                key={optIdx}
                type="button"
                className={selected ? `${styles.choice} ${styles.choiceSelected}` : styles.choice}
                onClick={() => toggleChoice(optIdx)}
                aria-pressed={selected}
                disabled={disabled}
              >
                <span
                  className={`${styles.indicator} ${q.multiSelect ? styles.indicatorCheck : styles.indicatorRadio}${selected ? ` ${styles.indicatorSelected}` : ""}`}
                  aria-hidden="true"
                />
                <span className={styles.choiceLabel}>{opt.label}</span>
                {opt.description !== undefined && (
                  <span className={styles.choiceDesc}>{opt.description}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Free-form input */}
        <div className={styles.freeForm}>
          <label className={styles.freeFormLabel} htmlFor={`iqset-free-${currentIndex}`}>
            or, in your own words
          </label>
          <textarea
            id={`iqset-free-${currentIndex}`}
            className={styles.freeFormInput}
            value={currentFreeForm}
            onChange={(e) => setFreeForm(currentIndex, e.target.value)}
            disabled={disabled}
            placeholder="…something else? sketch the reasoning."
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={disabled || !canSubmit}
          >
            Submit ↵
          </button>
          <button
            type="button"
            className={styles.clarifyBtn}
            onClick={handleClarify}
            disabled={disabled}
          >
            ↑ clarify in chat
          </button>
          <div className={styles.navArrows}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => prevIndex !== null && onTabClick(prevIndex)}
              disabled={prevIndex === null || disabled}
              aria-label="Previous question"
            >
              ‹ prev
            </button>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => nextIndex !== null && onTabClick(nextIndex)}
              disabled={nextIndex === null || disabled}
              aria-label="Next question"
            >
              next ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
